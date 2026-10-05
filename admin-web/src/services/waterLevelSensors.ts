export type WaterLevelSensorStatus = 'Active' | 'Unavailable';

export type WaterLevelSensor = {
  id: string;
  barangayName: string;
  status: WaterLevelSensorStatus;
  distanceCm: number | null;
  waterLevelPercentage: number;
  hasReading: boolean;
  temperatureCelsius: number | null;
  humidityPercentage: number | null;
};

const DATABASE_URL = 'https://capstone-4de76-default-rtdb.asia-southeast1.firebasedatabase.app';
const SENSOR_STATUS_PATH = 'Sensor Status Settings';

const SENSOR_ASSIGNMENTS = [
  { id: 'waterSensor1', barangayName: 'Palingon' },
  { id: 'waterSensor2', barangayName: 'Sampiruhan' },
  { id: 'waterSensor3', barangayName: 'Lingga' },
  { id: 'waterSensor4', barangayName: 'Parian' },
  { id: 'waterSensor5', barangayName: 'Looc' },
  { id: 'waterSensor6', barangayName: 'Uwisan' },
] as const;

export function distanceToWaterLevelPercentage(distanceCm: number | null) {
  if (distanceCm === null || !Number.isFinite(distanceCm)) return 0;
  const fullDistanceCm = 20;
  const emptyDistanceCm = 200;
  if (distanceCm <= fullDistanceCm) return 100;
  if (distanceCm >= emptyDistanceCm) return 0;
  return ((emptyDistanceCm - distanceCm) / (emptyDistanceCm - fullDistanceCm)) * 100;
}

function readNumber(payload: unknown, ...keys: string[]) {
  if (!payload || typeof payload !== 'object') return null;
  const source = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = Number(source[key]);
    if (source[key] !== '' && source[key] !== null && source[key] !== undefined && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

async function loadSensorStatuses(): Promise<Record<string, WaterLevelSensorStatus>> {
  try {
    const response = await fetch(`${DATABASE_URL}/${encodeURIComponent(SENSOR_STATUS_PATH)}.json`);
    if (!response.ok) return {};
    const payload = await response.json() as unknown;
    if (!payload || typeof payload !== 'object') return {};

    return Object.entries(payload as Record<string, unknown>).reduce<Record<string, WaterLevelSensorStatus>>(
      (statuses, [sensorId, value]) => {
        const storedStatus = value && typeof value === 'object'
          ? String((value as Record<string, unknown>).status || '')
          : String(value || '');
        statuses[sensorId] = storedStatus === 'Unavailable' ? 'Unavailable' : 'Active';
        return statuses;
      },
      {},
    );
  } catch {
    return {};
  }
}

export async function loadWaterLevelSensors(): Promise<WaterLevelSensor[]> {
  const sensorStatuses = await loadSensorStatuses();

  return Promise.all(SENSOR_ASSIGNMENTS.map(async (assignment) => {
    const status = sensorStatuses[assignment.id] || 'Active';
    try {
      const response = await fetch(`${DATABASE_URL}/${assignment.id}.json`);
      if (!response.ok) throw new Error('Sensor request failed');
      const payload = await response.json() as unknown;
      const source = payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
      const distancePayload = source?.distance;
      const distanceCm = typeof distancePayload === 'number' && Number.isFinite(distancePayload)
        ? distancePayload
        : readNumber(distancePayload, 'distanceCm', 'distance_cm', 'distance')
          ?? readNumber(payload, 'distanceCm', 'distance_cm');
      const reportedPercentage = readNumber(payload, 'fillPct', 'fill_pct', 'fillPercentage', 'percentage', 'level')
        ?? readNumber(distancePayload, 'fillPct', 'fill_pct', 'fillPercentage', 'percentage', 'level');
      const temperatureCelsius = readNumber(payload, 'temperatureCelsius', 'temperature_celsius', 'temperature', 'tempC', 'temp')
        ?? readNumber(distancePayload, 'temperatureCelsius', 'temperature_celsius', 'temperature', 'tempC', 'temp');
      const humidityReading = readNumber(payload, 'humidityPercentage', 'humidity_percentage', 'relativeHumidity', 'relative_humidity', 'humidity', 'humidityPct')
        ?? readNumber(distancePayload, 'humidityPercentage', 'humidity_percentage', 'relativeHumidity', 'relative_humidity', 'humidity', 'humidityPct');
      const waterLevelPercentage = reportedPercentage === null
        ? distanceToWaterLevelPercentage(distanceCm)
        : Math.max(0, Math.min(100, reportedPercentage));

      return {
        ...assignment,
        status,
        distanceCm,
        waterLevelPercentage,
        hasReading: distanceCm !== null || reportedPercentage !== null,
        temperatureCelsius,
        humidityPercentage: humidityReading === null ? null : Math.max(0, Math.min(100, humidityReading)),
      };
    } catch {
      return { ...assignment, status, distanceCm: null, waterLevelPercentage: 0, hasReading: false, temperatureCelsius: null, humidityPercentage: null };
    }
  }));
}
