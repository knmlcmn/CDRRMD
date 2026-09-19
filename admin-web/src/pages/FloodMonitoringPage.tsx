import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminShell from '../components/AdminShell';
import { d } from '../adminDesign';
import { api } from '../services/apiClient';

type Props = {
  onLogout: () => void;
  onOpenDashboard: () => void;
  onOpenAdmin: () => void;
  onOpenUsers: () => void;
  onOpenBarangay: () => void;
  onOpenRescuers: () => void;
  onOpenMonitoring: () => void;
  onOpenFloodMonitoring: () => void;
  onOpenEvacuationAreas: () => void;
  onOpenPostUpdates: () => void;
  onAuthError: () => void;
};

type SensorStatus = 'Active' | 'Unavailable';

type HardwareSlot = {
  hardwareId: string;
  hardwareNo: string;
  assignedArea: string;
  waterLevelLabel: string;
  fillPct: number;
  hasReading: boolean;
  sensorStatus: SensorStatus;
  temperatureCelsius?: number;
  humidityPercentage?: number;
};

type FirebaseHardwareReading = {
  barangayName?: string;
  waterLevelLabel?: string;
  waterLevel?: string;
  distanceCm?: number;
  fillPct?: number;
  temperatureCelsius?: number;
  humidityPercentage?: number;
  reportCode?: string;
  updatedAt?: string;
};

type FirebaseFloodReport = {
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

const HARDWARE_AREAS = [
  'Brgy Palingon',
  'Brgy. Sampiruhan',
  'Brgy. Lingga',
  'Brgy. Parian',
  'Brgy. Looc',
  'Brgy. Uwisan',
];

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBb5DqoUWzd3ExHGP409wyAHtvaYQFss3Y',
  authDomain: 'capstone-4de76.firebaseapp.com',
  databaseURL: 'https://capstone-4de76-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'capstone-4de76',
  storageBucket: 'capstone-4de76.firebasestorage.app',
  messagingSenderId: '453582322365',
  appId: '1:453582322365:web:9eb52fd15e24e1dc2f15d4',
  measurementId: 'G-K1Q5R7CT7N',
} as const;

const FIREBASE_SENSOR_PATHS = [
  'waterSensor1',
  'waterSensor2',
  'waterSensor3',
  'waterSensor4',
  'waterSensor5',
  'waterSensor6',
] as const;

const FIREBASE_FLOOD_REPORTS_PATH = 'Flood Reports';
const FIREBASE_SENSOR_STATUS_PATH = 'Sensor Status Settings';
const FLOOD_REPORT_THRESHOLD = 40;
const HIGH_WATER_THRESHOLD = 61;

function distanceToFillPct(distanceCm?: number | null) {
  if (typeof distanceCm !== 'number' || !Number.isFinite(distanceCm)) {
    return 0;
  }

  const nearFullDistanceCm = 20;
  const emptyDistanceCm = 200;

  if (distanceCm <= nearFullDistanceCm) {
    return 100;
  }

  if (distanceCm >= emptyDistanceCm) {
    return 0;
  }

  return Math.max(0, Math.min(100, ((emptyDistanceCm - distanceCm) / (emptyDistanceCm - nearFullDistanceCm)) * 100));
}

function optionalNumber(...values: unknown[]) {
  const value = values.find((item) => item !== undefined && item !== null && item !== '');
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function temperatureStatus(value?: number) {
  if (typeof value !== 'number') return { icon: '\u2014', label: 'No reading', className: 'climate-badge-unavailable' };
  if (value < 25) return { icon: '\u2744\uFE0F', label: 'Cold', className: 'climate-badge-cold' };
  if (value < 32) return { icon: '\u2600\uFE0F', label: 'Warm', className: 'climate-badge-warm' };
  return { icon: '\uD83D\uDD25', label: 'Hot', className: 'climate-badge-hot' };
}

function humidityStatus(value?: number) {
  if (typeof value !== 'number') return { icon: '\u2014', label: 'No reading', className: 'climate-badge-unavailable' };
  if (value < 40) return { icon: '\uD83D\uDCA7', label: 'Low', className: 'climate-badge-humidity-low' };
  if (value < 70) return { icon: '\uD83D\uDCA6', label: 'Moderate', className: 'climate-badge-humidity-moderate' };
  return { icon: '\uD83C\uDF0A', label: 'High', className: 'climate-badge-humidity-high' };
}

function normalizeFirebaseReading(value: unknown): FirebaseHardwareReading | null {
  if (typeof value === 'number') {
    return {
      distanceCm: Number.isFinite(value) ? value : undefined,
    };
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const reading = value as Record<string, unknown>;
  const nestedDistance = reading.distance && typeof reading.distance === 'object'
    ? reading.distance as Record<string, unknown>
    : null;
  const barangayName = String(reading.barangayName || reading.barangay_name || reading.barangay || nestedDistance?.barangayName || nestedDistance?.barangay_name || nestedDistance?.barangay || '').trim();
  const waterLevelLabel = String(reading.waterLevelLabel || reading.water_level_label || reading.waterLevel || reading.water_level || nestedDistance?.waterLevelLabel || nestedDistance?.water_level_label || nestedDistance?.waterLevel || nestedDistance?.water_level || '').trim();
  const distanceCm = optionalNumber(
    reading.distanceCm,
    reading.distance_cm,
    typeof reading.distance === 'number' ? reading.distance : undefined,
    nestedDistance?.distanceCm,
    nestedDistance?.distance_cm,
    nestedDistance?.distance,
  );
  const fillPct = optionalNumber(
    reading.fillPct,
    reading.fill_pct,
    reading.fillPercentage,
    reading.percentage,
    reading.level,
    nestedDistance?.fillPct,
    nestedDistance?.fill_pct,
    nestedDistance?.fillPercentage,
    nestedDistance?.percentage,
    nestedDistance?.level,
  );
  const reportCode = String(reading.reportCode || reading.report_code || reading.code || nestedDistance?.reportCode || nestedDistance?.report_code || nestedDistance?.code || '').trim();
  const updatedAt = String(reading.updatedAt || reading.updated_at || reading.timestamp || nestedDistance?.updatedAt || nestedDistance?.updated_at || nestedDistance?.timestamp || '').trim();
  const temperatureCelsius = optionalNumber(
    reading.temperatureCelsius,
    reading.temperature_celsius,
    reading.temperature,
    reading.tempC,
    reading.temp,
    nestedDistance?.temperatureCelsius,
    nestedDistance?.temperature_celsius,
    nestedDistance?.temperature,
    nestedDistance?.tempC,
    nestedDistance?.temp,
  );
  const humidityPercentage = optionalNumber(
    reading.humidityPercentage,
    reading.humidity_percentage,
    reading.relativeHumidity,
    reading.relative_humidity,
    reading.humidity,
    nestedDistance?.humidityPercentage,
    nestedDistance?.humidity_percentage,
    nestedDistance?.relativeHumidity,
    nestedDistance?.relative_humidity,
    nestedDistance?.humidity,
  );

  return {
    barangayName: barangayName || undefined,
    waterLevelLabel: waterLevelLabel || undefined,
    waterLevel: String(reading.waterLevel || reading.water_level || nestedDistance?.waterLevel || nestedDistance?.water_level || '').trim() || undefined,
    distanceCm,
    fillPct: typeof fillPct === 'number' ? Math.max(0, Math.min(100, fillPct)) : undefined,
    temperatureCelsius,
    humidityPercentage: typeof humidityPercentage === 'number'
      ? Math.max(0, Math.min(100, humidityPercentage))
      : undefined,
    reportCode: reportCode || undefined,
    updatedAt: updatedAt || undefined,
  };
}

async function loadFirebaseHardwareReadings(): Promise<Array<FirebaseHardwareReading | null>> {
  const baseUrl = FIREBASE_CONFIG.databaseURL.replace(/\/$/, '');

  return Promise.all(
    FIREBASE_SENSOR_PATHS.map(async (sensorPath) => {
      try {
        const response = await fetch(`${baseUrl}/${sensorPath}.json`);

        if (!response.ok) {
          return null;
        }

        const payload = (await response.json()) as unknown;
        return normalizeFirebaseReading(payload);
      } catch {
        return null;
      }
    }),
  );
}

async function loadFirebaseSensorStatuses(): Promise<Record<string, SensorStatus>> {
  const baseUrl = FIREBASE_CONFIG.databaseURL.replace(/\/$/, '');
  const statusPath = encodeURIComponent(FIREBASE_SENSOR_STATUS_PATH);
  const response = await fetch(`${baseUrl}/${statusPath}.json`);

  if (!response.ok) {
    throw new Error('Unable to read sensor status settings.');
  }

  const payload = (await response.json()) as unknown;
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  return Object.entries(payload as Record<string, unknown>).reduce<Record<string, SensorStatus>>(
    (statuses, [hardwareId, value]) => {
      const storedStatus = value && typeof value === 'object'
        ? String((value as Record<string, unknown>).status || '')
        : String(value || '');
      statuses[hardwareId] = storedStatus === 'Unavailable' ? 'Unavailable' : 'Active';
      return statuses;
    },
    {},
  );
}

async function putFirebaseSensorStatus(hardwareId: string, status: SensorStatus) {
  const baseUrl = FIREBASE_CONFIG.databaseURL.replace(/\/$/, '');
  const statusPath = encodeURIComponent(FIREBASE_SENSOR_STATUS_PATH);
  const hardwarePath = encodeURIComponent(hardwareId);
  const response = await fetch(`${baseUrl}/${statusPath}/${hardwarePath}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, updatedAt: new Date().toISOString() }),
  });

  if (!response.ok) {
    throw new Error(`Unable to update the status for ${hardwareId}.`);
  }
}

function normalizeFloodReport(firebaseKey: string, value: unknown): FirebaseFloodReport | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const report = value as Record<string, unknown>;
  const storedStatus = String(report.status || '').trim();
  const storedLevel = String(report.level || '').trim();
  const level = storedLevel === 'Moderate' || storedLevel === 'High'
    ? storedLevel
    : storedStatus;
  const waterLevelPercentage = Number(report.waterLevelPercentage);
  if (!report.reportId || (level !== 'Moderate' && level !== 'High')) {
    return null;
  }

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

async function loadFirebaseFloodReports(): Promise<FirebaseFloodReport[]> {
  const baseUrl = FIREBASE_CONFIG.databaseURL.replace(/\/$/, '');
  const encodedPath = encodeURIComponent(FIREBASE_FLOOD_REPORTS_PATH);
  const response = await fetch(`${baseUrl}/${encodedPath}.json`);

  if (!response.ok) {
    throw new Error('Unable to read Firebase flood reports.');
  }

  const payload = (await response.json()) as unknown;
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  return Object.entries(payload as Record<string, unknown>).reduce<FirebaseFloodReport[]>(
    (result, [firebaseKey, value]) => {
      const report = normalizeFloodReport(firebaseKey, value);
      if (report) {
        result.push(report);
      }
      return result;
    },
    [],
  );
}

function createFloodReportId(hardwareNo: string, now: Date) {
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0'))
    .join('');
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join('');

  return `FLD-${date}-${time}-${hardwareNo}`;
}

async function putFirebaseFloodReport(report: FirebaseFloodReport) {
  const baseUrl = FIREBASE_CONFIG.databaseURL.replace(/\/$/, '');
  const reportsPath = encodeURIComponent(FIREBASE_FLOOD_REPORTS_PATH);
  const reportPath = encodeURIComponent(report.firebaseKey);
  const response = await fetch(`${baseUrl}/${reportsPath}/${reportPath}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });

  if (!response.ok) {
    throw new Error(`Unable to save the flood report for ${report.hardwareNo}.`);
  }
}

async function publishResidentFloodAlert(report: FirebaseFloodReport) {
  if (!report.active || (report.level !== 'Moderate' && report.level !== 'High')) {
    return;
  }
  await api.post('/content/flood-sensor-alerts', {
    eventKey: report.reportId,
    barangayName: report.location,
    level: report.level,
    hardwareNo: report.hardwareNo,
    waterLevelPercentage: report.waterLevelPercentage,
    updatedAt: report.updatedAt,
  });
}

async function syncFirebaseFloodReports(
  slots: HardwareSlot[],
  savedReports: FirebaseFloodReport[],
): Promise<FirebaseFloodReport[]> {
  const now = new Date();
  const nowIso = now.toISOString();
  const nextReports = [...savedReports];
  const writes: Promise<void>[] = [];

  slots.forEach((slot) => {
    const saved = savedReports
      .filter((report) => report.sensorId === slot.hardwareId && report.active)
      .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())[0];

    const closeActiveReport = () => {
      if (!saved?.active) {
        return;
      }

      const inactive: FirebaseFloodReport = {
        ...saved,
        status: 'Inactive',
        active: false,
        updatedAt: nowIso,
        endedAt: nowIso,
      };
      const savedIndex = nextReports.findIndex((report) => report.firebaseKey === inactive.firebaseKey);
      if (savedIndex >= 0) {
        nextReports[savedIndex] = inactive;
      }
      writes.push(putFirebaseFloodReport(inactive));
    };

    if (slot.sensorStatus === 'Unavailable') {
      closeActiveReport();
      return;
    }

    if (!slot.hasReading) {
      return;
    }

    if (slot.fillPct >= FLOOD_REPORT_THRESHOLD) {
      const level: FirebaseFloodReport['level'] = slot.fillPct >= HIGH_WATER_THRESHOLD ? 'High' : 'Moderate';
      const shouldStartEvent = !saved?.active;
      const reportId = shouldStartEvent ? createFloodReportId(slot.hardwareNo, now) : saved.reportId;
      const next: FirebaseFloodReport = {
        firebaseKey: shouldStartEvent ? reportId : saved.firebaseKey,
        sensorId: slot.hardwareId,
        reportId,
        location: slot.assignedArea,
        level,
        hardwareNo: slot.hardwareNo,
        status: 'Active',
        waterLevelPercentage: Number(slot.fillPct.toFixed(1)),
        active: true,
        createdAt: shouldStartEvent ? nowIso : saved.createdAt,
        updatedAt: nowIso,
        endedAt: null,
      };

      const savedIndex = nextReports.findIndex((report) => report.firebaseKey === next.firebaseKey);
      if (savedIndex >= 0) {
        nextReports[savedIndex] = next;
      } else {
        nextReports.push(next);
      }
      const hasChanged = shouldStartEvent
        || saved.level !== next.level
        || saved.location !== next.location
        || saved.waterLevelPercentage !== next.waterLevelPercentage;
      if (hasChanged) {
        writes.push(putFirebaseFloodReport(next));
      }
      return;
    }

    closeActiveReport();
  });

  await Promise.all(writes);

  // Publish every active event on each sync. The backend deduplicates by
  // hardware event and severity, so failed deliveries are retried safely.
  const alertResults = await Promise.allSettled(
    nextReports.filter((report) => report.active).map(publishResidentFloodAlert),
  );
  alertResults.forEach((result) => {
    if (result.status === 'rejected') {
      console.error('Unable to publish a resident flood alert.', result.reason);
    }
  });

  return nextReports
    .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime());
}

export default function FloodMonitoringPage({
  onLogout,
  onOpenDashboard,
  onOpenAdmin,
  onOpenUsers,
  onOpenBarangay,
  onOpenRescuers,
  onOpenMonitoring,
  onOpenFloodMonitoring,
  onOpenEvacuationAreas,
  onOpenPostUpdates,
  onAuthError,
}: Props) {
  void onOpenFloodMonitoring;

  const [reports, setReports] = useState<FirebaseFloodReport[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReportHistory, setShowReportHistory] = useState(false);
  const [hardwareSlots, setHardwareSlots] = useState<HardwareSlot[]>([]);
  const [sensorManagerOpen, setSensorManagerOpen] = useState(false);
  const [pendingSensorStatus, setPendingSensorStatus] = useState<{ hardwareId: string; status: SensorStatus } | null>(null);
  const [savingSensorStatus, setSavingSensorStatus] = useState(false);
  const [sensorStatusError, setSensorStatusError] = useState<string | null>(null);

  const loadData = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }

    try {
      const [firebaseReadings, savedFloodReports, savedSensorStatuses] = await Promise.all([
        loadFirebaseHardwareReadings(),
        loadFirebaseFloodReports(),
        loadFirebaseSensorStatuses(),
      ]);

      const nextHardwareSlots: HardwareSlot[] = Array.from({ length: 6 }, (_, index) => {
        const assignedArea = HARDWARE_AREAS[index];
        const hardwareId = `waterSensor${index + 1}`;

        return {
          hardwareId,
          hardwareNo: `HW-${String(index + 1).padStart(2, '0')}`,
          assignedArea,
          waterLevelLabel: 'No Reading',
          fillPct: 0,
          hasReading: false,
          sensorStatus: savedSensorStatuses[hardwareId] || 'Active',
          temperatureCelsius: undefined,
          humidityPercentage: undefined,
        };
      });

      firebaseReadings.forEach((firebaseReading, index) => {
        const hardwareSlot = nextHardwareSlots[index];
        if (!firebaseReading || !hardwareSlot) {
          return;
        }

        nextHardwareSlots[index] = {
          ...hardwareSlot,
          assignedArea: firebaseReading.barangayName || HARDWARE_AREAS[index],
          waterLevelLabel: typeof firebaseReading.distanceCm === 'number'
            ? `Distance: ${firebaseReading.distanceCm.toFixed(1)} cm`
            : firebaseReading.waterLevelLabel || firebaseReading.waterLevel || hardwareSlot.waterLevelLabel,
          fillPct: typeof firebaseReading.fillPct === 'number'
            ? firebaseReading.fillPct
            : distanceToFillPct(firebaseReading.distanceCm),
          hasReading: typeof firebaseReading.fillPct === 'number' || typeof firebaseReading.distanceCm === 'number',
          temperatureCelsius: firebaseReading.temperatureCelsius,
          humidityPercentage: firebaseReading.humidityPercentage,
        };
      });

      setHardwareSlots(nextHardwareSlots);
      const nextReports = await syncFirebaseFloodReports(nextHardwareSlots, savedFloodReports);
      setReports(nextReports);

      setSelectedReportId((currentId) => {
        const activeReports = nextReports.filter((item) => item.active);
        if (activeReports.length === 0) {
          return null;
        }
        return activeReports.some((item) => item.reportId === currentId)
          ? currentId
          : activeReports[0].reportId;
      });

      setError(null);
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      setError(apiError.response?.data?.message || (err instanceof Error ? err.message : 'Failed to load flood monitoring data.'));
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [onAuthError]);

  useEffect(() => {
    loadData(true).catch(() => {});

    const refreshTimer = setInterval(() => {
      loadData(false).catch(() => {});
    }, 10000);

    return () => clearInterval(refreshTimer);
  }, [loadData]);

  async function confirmSensorStatusChange() {
    if (!pendingSensorStatus || savingSensorStatus) {
      return;
    }

    const nextStatus = pendingSensorStatus;
    setSavingSensorStatus(true);
    setSensorStatusError(null);
    try {
      await putFirebaseSensorStatus(nextStatus.hardwareId, nextStatus.status);
      setHardwareSlots((currentSlots) => currentSlots.map((slot) => (
        slot.hardwareId === nextStatus.hardwareId
          ? { ...slot, sensorStatus: nextStatus.status }
          : slot
      )));
      setPendingSensorStatus(null);
      await loadData(false);
    } catch (statusError: unknown) {
      setSensorStatusError(statusError instanceof Error ? statusError.message : 'Unable to update the sensor status.');
    } finally {
      setSavingSensorStatus(false);
    }
  }

  const activeReports = useMemo(
    () => reports
      .filter((item) => item.active)
      .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime()),
    [reports],
  );

  const historyReports = useMemo(
    () => reports
      .filter((item) => !item.active)
      .sort((first, second) => {
        const firstDate = new Date(first.endedAt || first.createdAt).getTime();
        const secondDate = new Date(second.endedAt || second.createdAt).getTime();
        return secondDate - firstDate;
      }),
    [reports],
  );

  const displayedReports = showReportHistory ? historyReports : activeReports;

  const selectedReport = useMemo(
    () => displayedReports.find((item) => item.reportId === selectedReportId) ?? displayedReports[0] ?? null,
    [displayedReports, selectedReportId],
  );

  const pendingSensorSlot = pendingSensorStatus
    ? hardwareSlots.find((slot) => slot.hardwareId === pendingSensorStatus.hardwareId) || null
    : null;

  return (
    <AdminShell
      activeView="flood-monitoring"
      title="Flood Monitoring"
      subtitle="Live water levels and automated flood reports."
      noMainScroll
      onLogout={onLogout}
      onOpenDashboard={onOpenDashboard}
      onOpenAdmin={onOpenAdmin}
      onOpenUsers={onOpenUsers}
      onOpenBarangay={onOpenBarangay}
      onOpenRescuers={onOpenRescuers}
      onOpenMonitoring={onOpenMonitoring}
      onOpenFloodMonitoring={() => {}}
      onOpenEvacuationAreas={onOpenEvacuationAreas}
      onOpenPostUpdates={onOpenPostUpdates}
      actions={(
        <>
          <button onClick={onOpenEvacuationAreas} className={d.monitoring.floodHeaderAction}>Evacuation Readiness</button>
          <button onClick={() => { setSensorStatusError(null); setSensorManagerOpen(true); }} className={d.monitoring.floodHeaderAction}>Sensors</button>
        </>
      )}
    >
      {sensorManagerOpen ? (
        <div className={d.monitoring.sensorManagerOverlay} role="dialog" aria-modal="true" aria-labelledby="sensor-manager-title">
          <section className={d.monitoring.sensorManagerCard}>
            <header className={d.monitoring.sensorManagerHead}>
              <h2 id="sensor-manager-title" className={d.monitoring.sensorManagerTitle}>Barangay Sensors</h2>
              <button
                type="button"
                onClick={() => { setSensorManagerOpen(false); setPendingSensorStatus(null); }}
                className={d.monitoring.sensorManagerClose}
              >
                Close
              </button>
            </header>
            <div className={d.monitoring.sensorManagerBody}>
              {sensorStatusError ? <p className={d.monitoring.sensorManagerError}>{sensorStatusError}</p> : null}
              <div className={d.monitoring.sensorList}>
                {hardwareSlots.map((slot) => (
                  <article key={slot.hardwareId} className={d.monitoring.sensorRow}>
                    <p className={d.monitoring.sensorBarangay}>{slot.assignedArea}</p>
                    <p className={d.monitoring.sensorHardware}>{slot.hardwareNo}</p>
                    <button
                      type="button"
                      disabled={slot.sensorStatus === 'Active' || savingSensorStatus}
                      onClick={() => { setSensorStatusError(null); setPendingSensorStatus({ hardwareId: slot.hardwareId, status: 'Active' }); }}
                      className={d.monitoring.sensorActiveButton}
                    >
                      Active
                    </button>
                    <button
                      type="button"
                      disabled={slot.sensorStatus === 'Unavailable' || savingSensorStatus}
                      onClick={() => { setSensorStatusError(null); setPendingSensorStatus({ hardwareId: slot.hardwareId, status: 'Unavailable' }); }}
                      className={d.monitoring.sensorUnavailableButton}
                    >
                      Unavailable
                    </button>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {pendingSensorStatus && pendingSensorSlot ? (
        <div className={d.monitoring.sensorConfirmOverlay} role="alertdialog" aria-modal="true" aria-labelledby="sensor-confirm-title">
          <section className={d.monitoring.sensorConfirmCard}>
            <h2 id="sensor-confirm-title" className={d.monitoring.sensorConfirmTitle}>Confirm sensor status</h2>
            <p className={d.monitoring.sensorConfirmText}>
              Set {pendingSensorSlot.assignedArea} ({pendingSensorSlot.hardwareNo}) as {pendingSensorStatus.status}?
              {pendingSensorStatus.status === 'Unavailable' ? ' Its water indicator will be disabled and shown in gray.' : ' Its live water indicator and flood reporting will resume.'}
            </p>
            {sensorStatusError ? <p className={d.monitoring.sensorConfirmError}>{sensorStatusError}</p> : null}
            <div className={d.monitoring.sensorConfirmActions}>
              <button
                type="button"
                disabled={savingSensorStatus}
                onClick={() => { void confirmSensorStatusChange(); }}
                className={d.monitoring.sensorConfirmButton}
              >
                {savingSensorStatus ? 'Saving...' : 'Confirm'}
              </button>
              <button
                type="button"
                disabled={savingSensorStatus}
                onClick={() => setPendingSensorStatus(null)}
                className={d.monitoring.sensorNoButton}
              >
                No
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <div className={d.monitoring.root}>
        {error ? <div className={d.page.error}>{error}</div> : null}

        <section className={d.monitoring.floodIndicatorsCard}>
          <div className={d.monitoring.floodIndicatorsHead}>
            <h3 className={d.monitoring.floodIndicatorsTitle}>Water Level Indicators</h3>
            <p className={d.monitoring.rainRankUpdated}>{hardwareSlots.filter((slot) => slot.sensorStatus === 'Active' && slot.fillPct >= HIGH_WATER_THRESHOLD).length} high-level slots</p>
          </div>

          <div className={d.monitoring.floodSensorGrid}>
            {hardwareSlots.map((slot) => {
              const temperature = temperatureStatus(slot.temperatureCelsius);
              const humidity = humidityStatus(slot.humidityPercentage);

              return (
              <article key={slot.hardwareId} className={d.monitoring.floodSensorCard}>
                <p className={d.monitoring.floodSensorName}>
                  {slot.assignedArea}
                </p>
                <div
                  className={[
                    d.monitoring.floodSensorGauge,
                    slot.sensorStatus === 'Unavailable'
                      ? 'water-gauge-unavailable'
                      : slot.fillPct >= HIGH_WATER_THRESHOLD
                      ? 'water-gauge-high'
                      : slot.fillPct >= FLOOD_REPORT_THRESHOLD
                        ? 'water-gauge-moderate'
                        : 'water-gauge-low',
                  ].join(' ')}
                  style={{
                    background: slot.sensorStatus === 'Unavailable'
                      ? 'linear-gradient(180deg, #d1d5db 0%, #94a3b8 100%)'
                      : 'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)',
                  }}>
                  {slot.sensorStatus === 'Unavailable' ? (
                    <span className="sensor-unavailable-mark" aria-label="Sensor unavailable">/</span>
                  ) : (
                    <div
                      className="water-gauge-fill"
                      style={{
                        width: '100%',
                        height: `${Math.max(0, Math.min(100, slot.fillPct))}%`,
                        borderRadius: '0.75rem',
                        background: slot.fillPct >= HIGH_WATER_THRESHOLD ? 'linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)' : slot.fillPct >= FLOOD_REPORT_THRESHOLD ? 'linear-gradient(180deg, #f59e0b 0%, #d97706 100%)' : 'linear-gradient(180deg, #38bdf8 0%, #0284c7 100%)',
                      }}
                    >
                      <span className="water-gauge-surface" aria-hidden="true" />
                    </div>
                  )}
                </div>
                <div className="sensor-reading-details">
                  <strong className="sensor-water-percentage">{slot.sensorStatus === 'Unavailable' ? 'Unavailable' : `${slot.fillPct.toFixed(0)}%`}</strong>
                  <p className={temperature.className} title={`Temperature level: ${temperature.label}`}>
                    <span aria-hidden="true">{temperature.icon}</span>
                    <span>Temperature {typeof slot.temperatureCelsius === 'number' ? `${slot.temperatureCelsius.toFixed(1)}\u00B0C` : '--\u00B0C'}</span>
                  </p>
                  <p className={humidity.className} title={`Humidity level: ${humidity.label}`}>
                    <span aria-hidden="true">{humidity.icon}</span>
                    <span>Humidity {typeof slot.humidityPercentage === 'number' ? `${slot.humidityPercentage.toFixed(0)}%` : '--%'}</span>
                  </p>
                </div>
              </article>
              );
            })}
          </div>
        </section>

        <section className={d.monitoring.lowerGrid}>
          <article className={d.monitoring.incidentsCard}>
            <div className={d.monitoring.incidentsHead}>
              <h3 className={d.monitoring.incidentsTitle}>{showReportHistory ? 'Flood Report History' : 'Flood Reports'}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <p className={d.monitoring.rainRankUpdated}>
                  {showReportHistory ? `${historyReports.length} historical` : `${activeReports.length} active`}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowReportHistory((previous) => !previous);
                    setSelectedReportId(null);
                  }}
                  style={{
                    border: 0,
                    padding: 0,
                    background: 'transparent',
                    color: '#38bdf8',
                    font: 'inherit',
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    textDecoration: 'underline',
                    cursor: 'pointer',
                  }}
                >
                  {showReportHistory ? 'Active reports' : 'History'}
                </button>
              </div>
            </div>
            <div className={d.monitoring.incidentsTableWrap}>
              <table className={d.monitoring.floodReportsTable}>
                <thead>
                  <tr>
                    <th>Report ID</th><th>Location</th><th>Level</th><th>Hardware no.</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedReports.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={d.table.empty}>
                        {showReportHistory ? 'No flood report history yet.' : 'No active flood reports.'}
                      </td>
                    </tr>
                  ) : displayedReports.map((item) => (
                    <tr
                      key={item.reportId}
                      onClick={() => setSelectedReportId(item.reportId)}
                      className={[d.monitoring.rowBase, selectedReport?.reportId === item.reportId ? d.monitoring.rowSelected : null].filter(Boolean).join(' ')}
                    >
                      <td>{item.reportId}</td>
                      <td className={d.monitoring.rowLocation}>{item.location}</td>
                      <td>
                        <span
                          className={[
                            d.monitoring.statusChip,
                            item.level === 'High' ? d.monitoring.floodLevelHigh : d.monitoring.floodLevelModerate,
                          ].join(' ')}
                        >
                          {item.level}
                        </span>
                      </td>
                      <td>{item.hardwareNo}</td>
                      <td>
                        <span
                          className={[
                            d.monitoring.statusChip,
                            item.status === 'Active' ? d.monitoring.floodStatusActive : d.monitoring.floodStatusUnavailable,
                          ].join(' ')}
                        >
                          {item.status === 'Active' ? 'Active' : 'Unavailable'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className={d.monitoring.validationCard}>
            <h3 className={d.monitoring.validationTitle}>Flood Watch Notes</h3>
            <div className={d.monitoring.validationScrollWrap}>
              <div className={d.monitoring.validationStack}>
                <p className={d.monitoring.validationCurrent}>Active flood reports: {activeReports.length}</p>
                <p className={d.monitoring.assignNote}>Each rectangle represents one assigned hardware sensor and fills according to its detected water level.</p>
                <p className={d.monitoring.assignNote}>Reports are generated at 40% and update from Moderate to High at 61%.</p>
              </div>
            </div>
          </article>
        </section>

        {loading ? <p className={d.page.loading}>Loading flood monitoring data...</p> : null}
      </div>
    </AdminShell>
  );
}
