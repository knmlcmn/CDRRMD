import type { ResponderRole, WaterLevelSensor } from '../types';

function normalizeBarangay(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase().replace(/^(barangay|brgy\.?)[\s-]*/i, '');
}

export function scopeWaterLevelSensors(
  sensors: WaterLevelSensor[],
  role: ResponderRole,
  barangayName?: string | null,
) {
  if (role !== 'barangay_rescuer') return sensors;
  const jurisdiction = normalizeBarangay(barangayName);
  if (!jurisdiction) return [];
  return sensors.filter((sensor) => normalizeBarangay(sensor.barangayName) === jurisdiction);
}
