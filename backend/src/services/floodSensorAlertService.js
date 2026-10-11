const pool = require('../config/db');
const { loadHardwareSensorSnapshot } = require('./hardwareSensorService');
const MODERATE_THRESHOLD = 40;
const HIGH_THRESHOLD = 61;

let lastSyncAt = 0;
let syncPromise = null;

async function insertAlert(client, { eventKey, barangayName, hardwareNo, level, percentage, sensorUpdatedAt = null }) {
  const inserted = await client.query(
    `INSERT INTO flood_sensor_alert_events
       (event_key, barangay_name, hardware_no, level, water_level_percentage, sensor_updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (event_key, level) DO NOTHING
     RETURNING id`,
    [eventKey, barangayName, hardwareNo, level, percentage, sensorUpdatedAt],
  );
  if (inserted.rows.length === 0) return { published: false, recipients: 0 };

  const high = level === 'high';
  const title = high ? 'Immediate evacuation required' : 'Prepare to evacuate';
  const body = high
    ? `Water levels are rising and have reached a dangerous level in Barangay ${barangayName} (${Math.round(percentage)}%, ${hardwareNo || 'local water sensor'}). Proceed immediately to a safe evacuation area. If you cannot evacuate safely or require assistance, send a rescue request now.`
    : `Water levels are rising in Barangay ${barangayName} (${Math.round(percentage)}%, ${hardwareNo || 'local water sensor'}). Prepare to move to a safe evacuation area immediately. If you are trapped or require assistance, send a rescue request now.`;
  const recipients = await client.query(
    `INSERT INTO user_notifications
       (user_id, report_id, title, body, category, severity, barangay_name, source_event_key)
     SELECT id, NULL, $1, $2, 'flood_sensor', $3, $4::varchar, $5
     FROM users
     WHERE role = 'user'
       AND COALESCE(is_archived, FALSE) = FALSE
       AND LOWER(COALESCE(current_barangay_name, barangay_name, '')) = LOWER($4::varchar)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [title, body, level, barangayName, eventKey],
  );
  return { published: true, recipients: recipients.rows.length };
}

async function performSensorSync() {
  const snapshot = await loadHardwareSensorSnapshot();
  const sensors = snapshot.sensors.map((sensor) => ({
    ...sensor,
    percentage: sensor.waterLevelPercentage,
  }));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lock = await client.query("SELECT pg_try_advisory_xact_lock(hashtext('flood_sensor_alert_sync')) AS acquired");
    if (!lock.rows[0]?.acquired) {
      await client.query('ROLLBACK');
      return;
    }

    const settingKeys = sensors.map((sensor) => `flood_sensor_state:${sensor.id}`);
    const stored = await client.query(
      'SELECT setting_key, setting_value FROM system_settings WHERE setting_key = ANY($1::varchar[])',
      [settingKeys],
    );
    const states = new Map(stored.rows.map((row) => {
      try { return [row.setting_key, JSON.parse(row.setting_value || '{}')]; } catch { return [row.setting_key, {}]; }
    }));

    for (const sensor of sensors) {
      const settingKey = `flood_sensor_state:${sensor.id}`;
      const previous = states.get(settingKey) || {};
      // A transient Firebase failure must not close an active event; otherwise
      // the next successful read would incorrectly create a duplicate alert.
      if (!sensor.readable) continue;
      if (sensor.active && !Number.isFinite(sensor.percentage)) continue;
      const percentage = Number(sensor.percentage);
      const activeLevel = sensor.active && Number.isFinite(percentage) && percentage >= MODERATE_THRESHOLD
        ? (percentage >= HIGH_THRESHOLD ? 'high' : 'moderate')
        : null;
      let eventKey = previous.eventKey || null;
      let highestLevel = previous.highestLevel || null;

      if (!activeLevel) {
        eventKey = null;
        highestLevel = null;
      } else {
        if (!eventKey) eventKey = `${sensor.id}-${Date.now()}`;
        const shouldPublish = !highestLevel || (activeLevel === 'high' && highestLevel !== 'high');
        if (shouldPublish) {
          await insertAlert(client, {
            eventKey,
            barangayName: sensor.barangayName,
            hardwareNo: sensor.hardwareNo,
            level: activeLevel,
            percentage,
          });
        }
        if (!highestLevel || activeLevel === 'high') highestLevel = activeLevel;
      }

      const nextState = JSON.stringify({ eventKey, highestLevel });
      if (nextState !== JSON.stringify(previous)) {
        await client.query(
          `INSERT INTO system_settings (setting_key, setting_value)
           VALUES ($1, $2)
           ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`,
          [settingKey, nextState],
        );
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function syncFloodSensorAlerts() {
  if (Date.now() - lastSyncAt < 5_000) return;
  if (!syncPromise) {
    syncPromise = performSensorSync()
      .then(() => { lastSyncAt = Date.now(); })
      .finally(() => { syncPromise = null; });
  }
  return syncPromise;
}

module.exports = { syncFloodSensorAlerts };
