import { api } from '../../services/api';
import type { Assignment, AssignmentHistory, FloodReportLogPage, RescuerAccount, WaterLevelSensor } from '../types';

export async function loadAssignments() {
  const { data } = await api.get<Assignment[]>('/rescuers/incidents/mine');
  return Array.isArray(data) ? data : [];
}

export async function loadWeeklyHistory() {
  const { data } = await api.get<AssignmentHistory[]>('/rescuers/incidents/history');
  return Array.isArray(data) ? data : [];
}

export async function loadCompleteHistory() {
  const { data } = await api.get<AssignmentHistory[]>('/rescuers/incidents/history/all');
  return Array.isArray(data) ? data : [];
}

export async function loadRescuerAccounts() {
  const { data } = await api.get<RescuerAccount[]>('/rescuers/accounts');
  return Array.isArray(data) ? data : [];
}

export async function loadFloodReportLogs(view: 'today' | 'history', page: number) {
  const { data } = await api.get<FloodReportLogPage>('/rescuers/flood-reports/logs', {
    params: { view, page },
  });
  return data;
}

export function acknowledgeAssignment(backupRequestId: number) {
  return api.patch(`/backup-requests/${backupRequestId}/respond`);
}

export function sendHeartbeat() {
  return api.post('/rescuers/presence/heartbeat');
}

export function updateResponderLocation(latitude: number, longitude: number) {
  return api.patch<{
    pickupConfirmed?: boolean;
    rerouted?: boolean;
    evacuationAreaName?: string | null;
  }>('/rescuers/location', { latitude, longitude });
}

export function updateMyProfile(payload: {
  firstName: string;
  lastName: string;
  email: string;
  address: string;
  contactNumber: string;
}) {
  return api.put('/auth/me', payload);
}

function finiteNumberOrNull(value: number | null) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

let waterSensorRequest: Promise<WaterLevelSensor[]> | null = null;
let cachedWaterSensors: WaterLevelSensor[] = [];
let waterSensorCachedAt = 0;
const WATER_SENSOR_CACHE_MS = 1_500;

export async function loadWaterLevelSensors(): Promise<WaterLevelSensor[]> {
  if (cachedWaterSensors.length > 0 && Date.now() - waterSensorCachedAt < WATER_SENSOR_CACHE_MS) {
    return cachedWaterSensors;
  }
  if (waterSensorRequest) return waterSensorRequest;

  waterSensorRequest = loadWaterLevelSensorsFromApi()
    .then((sensors) => {
      cachedWaterSensors = sensors;
      waterSensorCachedAt = Date.now();
      return sensors;
    })
    .finally(() => {
      waterSensorRequest = null;
    });
  return waterSensorRequest;
}

async function loadWaterLevelSensorsFromApi(): Promise<WaterLevelSensor[]> {
  type SensorResponse = {
    updatedAt?: string | null;
    sensors?: Array<{
    id: string;
    barangayName: string;
    active: boolean;
    readable: boolean;
    distanceCm: number | null;
    waterLevelPercentage: number | null;
    temperatureCelsius: number | null;
    humidityPercentage: number | null;
    updatedAt?: string | null;
  }> };

  let data: SensorResponse;
  try {
    ({ data } = await api.get<SensorResponse>('/rescuers/water-level-sensors'));
  } catch (caught: any) {
    // Keep production v7 compatible while the authenticated rescuer route is
    // waiting for the next backend deployment. Jurisdiction filtering is also
    // enforced by the portal before anything is displayed or alerted.
    if (caught?.response?.status !== 404) throw caught;
    ({ data } = await api.get<SensorResponse>('/flood-risk/hardware-sensors'));
  }

  return (Array.isArray(data?.sensors) ? data.sensors : []).map((sensor) => {
    const percentage = finiteNumberOrNull(sensor.waterLevelPercentage);
    const humidityPercentage = finiteNumberOrNull(sensor.humidityPercentage);
    return {
      id: sensor.id,
      barangayName: sensor.barangayName,
      status: sensor.active ? 'Active' as const : 'Unavailable' as const,
      distanceCm: finiteNumberOrNull(sensor.distanceCm),
      waterLevelPercentage: percentage === null ? 0 : Math.max(0, Math.min(100, percentage)),
      hasReading: sensor.readable && percentage !== null,
      temperatureCelsius: finiteNumberOrNull(sensor.temperatureCelsius),
      humidityPercentage: humidityPercentage !== null
        ? Math.max(0, Math.min(100, humidityPercentage))
        : null,
      loggedAt: sensor.updatedAt || data.updatedAt || null,
    };
  });
}
