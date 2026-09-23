export type FloodSensorReport = {
  firebaseKey: string;
  sensorId: string;
  reportId: string;
  location: string;
  level: 'Moderate' | 'High';
  hardwareNo: string;
  status: 'Active' | 'Inactive';
  waterLevelPercentage: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
};

const FIREBASE_DATABASE_URL =
  'https://capstone-4de76-default-rtdb.asia-southeast1.firebasedatabase.app';
const FLOOD_REPORTS_PATH = 'Flood Reports';

function normalizeFloodReport(firebaseKey: string, value: unknown): FloodSensorReport | null {
  if (!value || typeof value !== 'object') return null;

  const report = value as Record<string, unknown>;
  const storedStatus = String(report.status || '').trim();
  const storedLevel = String(report.level || '').trim();
  const level = storedLevel === 'Moderate' || storedLevel === 'High' ? storedLevel : storedStatus;
  const waterLevelPercentage = Number(report.waterLevelPercentage);

  if (!report.reportId || (level !== 'Moderate' && level !== 'High')) return null;

  const active = report.active !== false && storedStatus !== 'Inactive';
  return {
    firebaseKey,
    sensorId: String(report.sensorId || firebaseKey),
    reportId: String(report.reportId),
    location: String(report.location || ''),
    level,
    hardwareNo: String(report.hardwareNo || report.sensorId || firebaseKey),
    status: active ? 'Active' : 'Inactive',
    waterLevelPercentage: Number.isFinite(waterLevelPercentage) ? waterLevelPercentage : 0,
    active,
    createdAt: String(report.createdAt || ''),
    updatedAt: String(report.updatedAt || report.createdAt || ''),
    endedAt: report.endedAt ? String(report.endedAt) : null,
  };
}

export async function loadFloodReportHistory(): Promise<FloodSensorReport[]> {
  const baseUrl = FIREBASE_DATABASE_URL.replace(/\/$/, '');
  const encodedPath = encodeURIComponent(FLOOD_REPORTS_PATH);
  const response = await fetch(`${baseUrl}/${encodedPath}.json`);

  if (!response.ok) throw new Error('Unable to read Firebase flood reports.');

  const payload = (await response.json()) as unknown;
  if (!payload || typeof payload !== 'object') return [];

  return Object.entries(payload as Record<string, unknown>).reduce<FloodSensorReport[]>(
    (result, [firebaseKey, value]) => {
      const report = normalizeFloodReport(firebaseKey, value);
      if (report) result.push(report);
      return result;
    },
    [],
  );
}
