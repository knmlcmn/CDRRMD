import { api } from './apiClient';

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

type HardwareSnapshotPayload = {
  sensors?: Array<{
    id: string;
    barangayName: string;
    active: boolean;
    readable: boolean;
    distanceCm: number | null;
    waterLevelPercentage: number | null;
    temperatureCelsius: number | null;
    humidityPercentage: number | null;
  }>;
};

const SNAPSHOT_DEDUPE_WINDOW_MS = 400;
export const WATER_LEVEL_POLL_INTERVAL_MS = 1_500;
let sensorSnapshotPromise: Promise<WaterLevelSensor[]> | null = null;
let sensorSnapshot: WaterLevelSensor[] | null = null;
let sensorSnapshotAt = 0;

function finiteNumberOrNull(value: number | null) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export async function loadWaterLevelSensors(): Promise<WaterLevelSensor[]> {
  const now = Date.now();
  if (sensorSnapshot && now - sensorSnapshotAt < SNAPSHOT_DEDUPE_WINDOW_MS) return sensorSnapshot;
  if (sensorSnapshotPromise) return sensorSnapshotPromise;

  sensorSnapshotPromise = api.get<HardwareSnapshotPayload>('/flood-risk/hardware-sensors').then(({ data }) => {
    const sensors: WaterLevelSensor[] = (Array.isArray(data?.sensors) ? data.sensors : []).map((sensor) => {
      const percentage = finiteNumberOrNull(sensor.waterLevelPercentage);
      const distanceCm = finiteNumberOrNull(sensor.distanceCm);
      const temperatureCelsius = finiteNumberOrNull(sensor.temperatureCelsius);
      const humidityPercentage = finiteNumberOrNull(sensor.humidityPercentage);
      return {
        id: sensor.id,
        barangayName: sensor.barangayName,
        status: sensor.active ? 'Active' : 'Unavailable',
        distanceCm,
        waterLevelPercentage: percentage === null ? 0 : Math.max(0, Math.min(100, percentage)),
        hasReading: sensor.readable && percentage !== null,
        temperatureCelsius,
        humidityPercentage: humidityPercentage !== null
          ? Math.max(0, Math.min(100, humidityPercentage))
          : null,
      };
    });
    sensorSnapshot = sensors;
    sensorSnapshotAt = Date.now();
    return sensors;
  }).finally(() => { sensorSnapshotPromise = null; });

  return sensorSnapshotPromise;
}
