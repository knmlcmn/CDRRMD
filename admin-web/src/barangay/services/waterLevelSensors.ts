import {
  loadWaterLevelSensors as loadSharedWaterLevelSensors,
  WATER_LEVEL_POLL_INTERVAL_MS,
  type WaterLevelSensor,
  type WaterLevelSensorStatus,
} from '../../services/waterLevelSensors';

export { WATER_LEVEL_POLL_INTERVAL_MS, type WaterLevelSensor, type WaterLevelSensorStatus };

export async function loadWaterLevelSensorStatuses(): Promise<Record<string, WaterLevelSensorStatus>> {
  const sensors = await loadSharedWaterLevelSensors();
  return Object.fromEntries(sensors.map((sensor) => [sensor.id, sensor.status]));
}

export async function loadWaterLevelSensors(): Promise<WaterLevelSensor[]> {
  return loadSharedWaterLevelSensors();
}
