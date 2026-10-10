const pool = require('../config/db');

const FIREBASE_DATABASE_URL = String(
  process.env.FIREBASE_DATABASE_URL || 'https://capstone-4de76-default-rtdb.asia-southeast1.firebasedatabase.app',
).replace(/\/$/, '');
const SENSOR_STATUS_PATH = 'Sensor Status Settings';
const MODERATE_THRESHOLD = 40;
const HIGH_THRESHOLD = 61;
const SENSOR_ASSIGNMENTS = [
  { id: 'waterSensor1', barangayName: 'Palingon', hardwareNo: 'HW-01' },
  { id: 'waterSensor2', barangayName: 'Sampiruhan', hardwareNo: 'HW-02' },
  { id: 'waterSensor3', barangayName: 'Lingga', hardwareNo: 'HW-03' },
  { id: 'waterSensor4', barangayName: 'Parian', hardwareNo: 'HW-04' },
  { id: 'waterSensor5', barangayName: 'Looc', hardwareNo: 'HW-05' },
  { id: 'waterSensor6', barangayName: 'Uwisan', hardwareNo: 'HW-06' },
];

let lastSyncAt = 0;
let syncPromise = null;

function readNumber(payload, ...keys) {
  if (!payload || typeof payload !== 'object') return null;
  for (const key of keys) {
    const value = Number(payload[key]);
    if (payload[key] !== '' && payload[key] !== null && payload[key] !== undefined && Number.isFinite(value)) return value;
  }
  return null;
}

function sensorPercentage(payload) {
  const distancePayload = payload?.distance;
  const reported = readNumber(payload, 'fillPct', 'fill_pct', 'fillPercentage', 'percentage', 'level')
    ?? readNumber(distancePayload, 'fillPct', 'fill_pct', 'fillPercentage', 'percentage', 'level');
  if (reported !== null) return Math.max(0, Math.min(100, reported));
  const distance = typeof distancePayload === 'number'
    ? distancePayload
    : readNumber(distancePayload, 'distanceCm', 'distance_cm', 'distance')
      ?? readNumber(payload, 'distanceCm', 'distance_cm');
  if (distance === null) return null;
  if (distance <= 20) return 100;
  if (distance >= 200) return 0;
  return ((200 - distance) / 180) * 100;
}

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

async function readFirebaseSensors() {
  const readPath = async (path) => {
    const response = await fetch(`${FIREBASE_DATABASE_URL}/${encodeURIComponent(path)}.json`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Firebase ${path} request returned ${response.status}.`);
    return response.json();
  };
  const [statuses, ...readings] = await Promise.all([
    readPath(SENSOR_STATUS_PATH).catch(() => ({})),
    ...SENSOR_ASSIGNMENTS.map((assignment) => readPath(assignment.id).catch(() => null)),
  ]);
  return SENSOR_ASSIGNMENTS.map((assignment, index) => {
    const storedStatus = statuses?.[assignment.id];
    const statusValue = storedStatus && typeof storedStatus === 'object' ? storedStatus.status : storedStatus;
    return {
      ...assignment,
      active: String(statusValue || 'Active') !== 'Unavailable',
      readable: readings[index] !== null,
      percentage: sensorPercentage(readings[index]),
    };
  });
}

async function performSensorSync() {
  const sensors = await readFirebaseSensors();
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
