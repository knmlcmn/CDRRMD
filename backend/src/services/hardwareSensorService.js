const FIREBASE_DATABASE_URL = String(
  process.env.FIREBASE_DATABASE_URL || 'https://capstone-4de76-default-rtdb.asia-southeast1.firebasedatabase.app',
).replace(/\/$/, '');
const cache = require('./cacheService');

const SENSOR_STATUS_PATH = 'Sensor Status Settings';
// Keep one short-lived snapshot for every connected portal. This prevents each
// browser from polling Firebase independently while still surfacing a hardware
// transition in well under the old ten-second cache window.
const CACHE_TTL_MS = 750;
const SENSOR_ASSIGNMENTS = [
  { id: 'waterSensor1', barangayName: 'Palingon', hardwareNo: 'HW-01', latitude: 14.2156165, longitude: 121.1835861 },
  { id: 'waterSensor2', barangayName: 'Sampiruhan', hardwareNo: 'HW-02', latitude: 14.21828, longitude: 121.18029 },
  { id: 'waterSensor3', barangayName: 'Lingga', hardwareNo: 'HW-03', latitude: 14.215696, longitude: 121.1796961 },
  { id: 'waterSensor4', barangayName: 'Parian', hardwareNo: 'HW-04', latitude: 14.214442, longitude: 121.1485544 },
  { id: 'waterSensor5', barangayName: 'Looc', hardwareNo: 'HW-05', latitude: 14.2224303, longitude: 121.1748345 },
  { id: 'waterSensor6', barangayName: 'Uwisan', hardwareNo: 'HW-06', latitude: 14.23816, longitude: 121.17206 },
];

let cachedSnapshot = null;
let cachedAt = 0;
let loadPromise = null;

function readNumber(payload, ...keys) {
  if (!payload || typeof payload !== 'object') return null;
  for (const key of keys) {
    const value = Number(payload[key]);
    if (payload[key] !== '' && payload[key] !== null && payload[key] !== undefined && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function distanceToWaterLevelPercentage(distanceCm) {
  if (!Number.isFinite(distanceCm)) return null;
  if (distanceCm <= 2) return 100;
  if (distanceCm >= 20) return 0;
  return ((20 - distanceCm) / 18) * 100;
}

function normalizeReading(payload) {
  if (typeof payload === 'number') {
    const distanceCm = Number.isFinite(payload) ? payload : null;
    return { distanceCm, waterLevelPercentage: distanceToWaterLevelPercentage(distanceCm) };
  }
  if (!payload || typeof payload !== 'object') return {};

  const nested = payload.distance && typeof payload.distance === 'object' ? payload.distance : null;
  const reportedPercentage = readNumber(payload, 'fillPct', 'fill_pct', 'fillPercentage', 'percentage', 'level')
    ?? readNumber(nested, 'fillPct', 'fill_pct', 'fillPercentage', 'percentage', 'level');
  const distanceCm = typeof payload.distance === 'number'
    ? payload.distance
    : readNumber(nested, 'distanceCm', 'distance_cm', 'distance')
      ?? readNumber(payload, 'distanceCm', 'distance_cm');
  let waterLevelPercentage = reportedPercentage;
  if (waterLevelPercentage === null && distanceCm !== null) {
    waterLevelPercentage = distanceToWaterLevelPercentage(distanceCm);
  }

  return {
    distanceCm,
    waterLevelPercentage: waterLevelPercentage === null ? null : Math.max(0, Math.min(100, waterLevelPercentage)),
    temperatureCelsius: readNumber(payload, 'temperatureCelsius', 'temperature_celsius', 'temperature', 'tempC', 'temp')
      ?? readNumber(nested, 'temperatureCelsius', 'temperature_celsius', 'temperature', 'tempC', 'temp'),
    humidityPercentage: readNumber(payload, 'humidityPercentage', 'humidity_percentage', 'relativeHumidity', 'relative_humidity', 'humidityPct', 'humidity')
      ?? readNumber(nested, 'humidityPercentage', 'humidity_percentage', 'relativeHumidity', 'relative_humidity', 'humidityPct', 'humidity'),
    latitude: readNumber(payload, 'latitude', 'lat') ?? readNumber(nested, 'latitude', 'lat'),
    longitude: readNumber(payload, 'longitude', 'lng', 'lon') ?? readNumber(nested, 'longitude', 'lng', 'lon'),
    updatedAt: String(payload.updatedAt || payload.updated_at || payload.timestamp || nested?.updatedAt || nested?.updated_at || nested?.timestamp || '').trim() || null,
  };
}

async function readFirebasePath(path) {
  const response = await fetch(`${FIREBASE_DATABASE_URL}/${encodeURIComponent(path)}.json`, {
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) throw new Error(`Firebase ${path} request returned ${response.status}.`);
  return response.json();
}

async function fetchHardwareSensorSnapshot() {
  const [statuses, ...payloads] = await Promise.all([
    readFirebasePath(SENSOR_STATUS_PATH).catch(() => ({})),
    ...SENSOR_ASSIGNMENTS.map((sensor) => readFirebasePath(sensor.id).catch(() => null)),
  ]);
  const sensors = SENSOR_ASSIGNMENTS.map((assignment, index) => {
    const payload = payloads[index];
    const statusRecord = statuses?.[assignment.id];
    const status = statusRecord && typeof statusRecord === 'object' ? statusRecord.status : statusRecord;
    const reading = normalizeReading(payload);
    return {
      ...assignment,
      latitude: Number.isFinite(reading.latitude) ? reading.latitude : assignment.latitude,
      longitude: Number.isFinite(reading.longitude) ? reading.longitude : assignment.longitude,
      active: String(status || 'Active') !== 'Unavailable',
      readable: payload !== null,
      distanceCm: reading.distanceCm ?? null,
      waterLevelPercentage: reading.waterLevelPercentage ?? null,
      temperatureCelsius: reading.temperatureCelsius ?? null,
      humidityPercentage: reading.humidityPercentage === null
        ? null
        : Math.max(0, Math.min(100, reading.humidityPercentage)),
      updatedAt: reading.updatedAt,
    };
  });
  const activeSensors = sensors.filter((sensor) => sensor.active && sensor.readable);
  const temperatures = activeSensors.map((sensor) => sensor.temperatureCelsius).filter(Number.isFinite);
  const humidities = activeSensors.map((sensor) => sensor.humidityPercentage).filter(Number.isFinite);
  return {
    source: 'firebase-hardware',
    updatedAt: new Date().toISOString(),
    sensors,
    averageTemperatureCelsius: temperatures.length
      ? temperatures.reduce((sum, value) => sum + value, 0) / temperatures.length
      : null,
    averageHumidityPercentage: humidities.length
      ? humidities.reduce((sum, value) => sum + value, 0) / humidities.length
      : null,
  };
}

async function loadHardwareSensorSnapshot() {
  const now = Date.now();
  if (cachedSnapshot && now - cachedAt < CACHE_TTL_MS) return cachedSnapshot;
  if (loadPromise) return loadPromise;

  loadPromise = cache.getOrLoad(
    'iot:hardware-snapshot',
    { ttlMs: 500 },
    fetchHardwareSensorSnapshot,
  ).then(({ value }) => {
    cachedSnapshot = value;
    const sourceTime = Date.parse(String(value?.updatedAt || ''));
    cachedAt = Number.isFinite(sourceTime) ? sourceTime : Date.now();
    return cachedSnapshot;
  }).finally(() => {
    loadPromise = null;
  });

  return loadPromise;
}

function nearestHardwareClimate(snapshot, latitude, longitude) {
  const sensors = (snapshot?.sensors || []).filter((sensor) =>
    sensor.active && sensor.readable &&
    (Number.isFinite(sensor.temperatureCelsius) || Number.isFinite(sensor.humidityPercentage)),
  );
  return sensors.reduce((nearest, sensor) => {
    const distance = ((sensor.latitude - latitude) ** 2) + ((sensor.longitude - longitude) ** 2);
    return !nearest || distance < nearest.distance ? { sensor, distance } : nearest;
  }, null)?.sensor || null;
}

module.exports = {
  loadHardwareSensorSnapshot,
  nearestHardwareClimate,
};
