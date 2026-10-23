const pool = require('../config/db');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const PUSH_CHANNEL_ID = 'flood-emergency-v1';
const MAX_BATCH_SIZE = 100;

function isExpoPushToken(value) {
  return /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(String(value || '').trim());
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function postExpoMessages(messages) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
        ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(messages),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Expo Push API returned HTTP ${response.status}.`);
    const payload = await response.json();
    return Array.isArray(payload?.data) ? payload.data : [];
  } finally {
    clearTimeout(timeout);
  }
}

async function sendPendingFloodPushNotifications({ userId = null } = {}) {
  const client = await pool.connect();
  let lockAcquired = false;
  try {
    const lock = await client.query("SELECT pg_try_advisory_lock(hashtext('flood_push_delivery')) AS acquired");
    lockAcquired = Boolean(lock.rows[0]?.acquired);
    if (!lockAcquired) return { sent: 0, pending: 0 };

    const { rows } = await client.query(
      `SELECT n.id, n.title, n.body, n.severity, n.barangay_name,
              ARRAY_AGG(t.expo_push_token ORDER BY t.id) AS push_tokens
       FROM user_notifications n
       JOIN user_device_push_tokens t ON t.user_id = n.user_id AND t.is_active = TRUE
       WHERE n.category = 'flood_sensor'
         AND n.push_sent_at IS NULL
         AND n.created_at >= NOW() - INTERVAL '24 hours'
         AND ($1::integer IS NULL OR n.user_id = $1)
       GROUP BY n.id
       ORDER BY n.created_at
       LIMIT 100`,
      [userId],
    );
    if (!rows.length) return { sent: 0, pending: 0 };

    await client.query(
      `UPDATE user_notifications SET push_attempted_at = NOW()
       WHERE id = ANY($1::integer[])`,
      [rows.map((row) => row.id)],
    );

    const deliveries = rows.flatMap((notification) => notification.push_tokens
      .filter(isExpoPushToken)
      .map((token) => ({
        notificationId: Number(notification.id),
        token,
        message: {
          to: token,
          title: notification.title,
          body: notification.body,
          sound: 'default',
          priority: 'high',
          channelId: PUSH_CHANNEL_ID,
          ttl: 3600,
          data: {
            type: 'flood_sensor',
            notificationId: Number(notification.id),
            severity: notification.severity,
            barangayName: notification.barangay_name,
          },
        },
      })));

    const successfulNotificationIds = new Set();
    const failedByNotification = new Map();
    const invalidTokens = new Set();
    for (const batch of chunks(deliveries, MAX_BATCH_SIZE)) {
      const tickets = await postExpoMessages(batch.map((item) => item.message));
      batch.forEach((delivery, index) => {
        const ticket = tickets[index];
        if (ticket?.status === 'ok') {
          successfulNotificationIds.add(delivery.notificationId);
          return;
        }
        const errorCode = String(ticket?.details?.error || 'EXPO_PUSH_REJECTED');
        failedByNotification.set(delivery.notificationId, errorCode);
        if (errorCode === 'DeviceNotRegistered') invalidTokens.add(delivery.token);
      });
    }

    if (invalidTokens.size) {
      await client.query(
        `UPDATE user_device_push_tokens
         SET is_active = FALSE, updated_at = NOW()
         WHERE expo_push_token = ANY($1::varchar[])`,
        [Array.from(invalidTokens)],
      );
    }

    const successfulIds = Array.from(successfulNotificationIds);
    if (successfulIds.length) {
      await client.query(
        `UPDATE user_notifications
         SET push_sent_at = NOW(), push_error = NULL
         WHERE id = ANY($1::integer[])`,
        [successfulIds],
      );
    }
    for (const [notificationId, pushError] of failedByNotification) {
      if (successfulNotificationIds.has(notificationId)) continue;
      await client.query(
        'UPDATE user_notifications SET push_error = $2 WHERE id = $1',
        [notificationId, pushError],
      );
    }
    return { sent: successfulIds.length, pending: rows.length - successfulIds.length };
  } finally {
    if (lockAcquired) await client.query("SELECT pg_advisory_unlock(hashtext('flood_push_delivery'))").catch(() => {});
    client.release();
  }
}

module.exports = { isExpoPushToken, sendPendingFloodPushNotifications, PUSH_CHANNEL_ID };
