import { useCallback, useEffect, useMemo, useState } from 'react';
import BarangayShell from '../components/BarangayShell';
import { d } from '../barangayDesign';
import { api } from '../services/apiClient';
import { loadWaterLevelSensorStatuses, type WaterLevelSensorStatus } from '../services/waterLevelSensors';
import type { IncidentReport } from '../types';

type Props = {
  barangayName: string;
  onLogout: () => void;
  onOpenMonitoring: () => void;
  onOpenAccount: () => void;
  onAuthError: () => void;
};

type HardwareSlot = {
  hardwareId: string;
  assignedArea: string;
  waterLevelLabel: string;
  fillPct: number;
  hasReading: boolean;
  sensorStatus: WaterLevelSensorStatus;
  temperatureCelsius?: number;
  humidityPercentage?: number;
  reportCode: string | null;
  updatedAt: string | null;
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

function sameData(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

const HARDWARE_AREAS = [
  'Brgy Palingon',
  'Brgy. Sampiruhan',
  'Brgy. Lingga',
  'Brgy. Parian',
  'Brgy. Looc',
  'Brgy. Uwisan',
] as const;

const FIREBASE_DATABASE_URL =
  'https://capstone-4de76-default-rtdb.asia-southeast1.firebasedatabase.app';

const FIREBASE_SENSOR_PATHS = [
  'waterSensor1',
  'waterSensor2',
  'waterSensor3',
  'waterSensor4',
  'waterSensor5',
  'waterSensor6',
] as const;

const ACTIVE_FLOOD_STATUSES = new Set(['pending', 'accepted', 'in_progress']);
const FLOOD_REPORT_THRESHOLD = 40;
const HIGH_WATER_THRESHOLD = 61;

function isActiveFloodStatus(value?: string | null) {
  return ACTIVE_FLOOD_STATUSES.has(String(value || '').toLowerCase());
}

function formatStatus(status?: string | null) {
  return String(status || 'pending')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatWaterLevelLabel(value?: string | null) {
  const normalized = String(value || '').trim();
  if (!normalized) return 'No Reading';

  return normalized
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function distanceToFillPct(distanceCm?: number | null) {
  if (typeof distanceCm !== 'number' || !Number.isFinite(distanceCm)) return 0;

  const nearFullDistanceCm = 20;
  const emptyDistanceCm = 200;
  if (distanceCm <= nearFullDistanceCm) return 100;
  if (distanceCm >= emptyDistanceCm) return 0;

  return Math.max(
    0,
    Math.min(
      100,
      ((emptyDistanceCm - distanceCm) / (emptyDistanceCm - nearFullDistanceCm)) * 100,
    ),
  );
}

function optionalNumber(...values: unknown[]) {
  const value = values.find((item) => item !== undefined && item !== null && item !== '');
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function temperatureStatus(value?: number) {
  if (typeof value !== 'number') return { icon: '\u2014', className: 'climate-badge-unavailable' };
  if (value < 25) return { icon: '\u2744\uFE0F', className: 'climate-badge-cold' };
  if (value < 32) return { icon: '\u2600\uFE0F', className: 'climate-badge-warm' };
  return { icon: '\uD83D\uDD25', className: 'climate-badge-hot' };
}

function humidityStatus(value?: number) {
  if (typeof value !== 'number') return { icon: '\u2014', className: 'climate-badge-unavailable' };
  if (value < 40) return { icon: '\uD83D\uDCA7', className: 'climate-badge-humidity-low' };
  if (value < 70) return { icon: '\uD83D\uDCA6', className: 'climate-badge-humidity-moderate' };
  return { icon: '\uD83C\uDF0A', className: 'climate-badge-humidity-high' };
}

function normalizeFirebaseReading(value: unknown): FirebaseHardwareReading | null {
  if (typeof value === 'number') {
    return { distanceCm: Number.isFinite(value) ? value : undefined };
  }

  if (!value || typeof value !== 'object') return null;

  const reading = value as Record<string, unknown>;
  const nestedDistance = reading.distance && typeof reading.distance === 'object'
    ? reading.distance as Record<string, unknown>
    : null;
  const barangayName = String(
    reading.barangayName || reading.barangay_name || reading.barangay || nestedDistance?.barangayName || nestedDistance?.barangay_name || nestedDistance?.barangay || '',
  ).trim();
  const waterLevelLabel = String(
    reading.waterLevelLabel || reading.water_level_label || reading.waterLevel || reading.water_level || nestedDistance?.waterLevelLabel || nestedDistance?.water_level_label || nestedDistance?.waterLevel || nestedDistance?.water_level || '',
  ).trim();
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
    reading.temperatureCelsius, reading.temperature_celsius, reading.temperature, reading.tempC, reading.temp,
    nestedDistance?.temperatureCelsius, nestedDistance?.temperature_celsius, nestedDistance?.temperature, nestedDistance?.tempC, nestedDistance?.temp,
  );
  const humidityPercentage = optionalNumber(
    reading.humidityPercentage, reading.humidity_percentage, reading.humidity, reading.humidityPct,
    nestedDistance?.humidityPercentage, nestedDistance?.humidity_percentage, nestedDistance?.humidity, nestedDistance?.humidityPct,
  );

  return {
    barangayName: barangayName || undefined,
    waterLevelLabel: waterLevelLabel || undefined,
    waterLevel: String(reading.waterLevel || reading.water_level || '').trim() || undefined,
    distanceCm,
    fillPct: typeof fillPct === 'number' ? Math.max(0, Math.min(100, fillPct)) : undefined,
    temperatureCelsius,
    humidityPercentage,
    reportCode: reportCode || undefined,
    updatedAt: updatedAt || undefined,
  };
}

async function loadFirebaseHardwareReadings(): Promise<Array<FirebaseHardwareReading | null>> {
  const baseUrl = FIREBASE_DATABASE_URL.replace(/\/$/, '');

  return Promise.all(
    FIREBASE_SENSOR_PATHS.map(async (sensorPath) => {
      try {
        const response = await fetch(`${baseUrl}/${sensorPath}.json`);
        if (!response.ok) return null;

        return normalizeFirebaseReading((await response.json()) as unknown);
      } catch {
        return null;
      }
    }),
  );
}

export default function FloodMonitoringPage({
  barangayName,
  onLogout,
  onOpenMonitoring,
  onOpenAccount,
  onAuthError,
}: Props) {
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hardwareSlots, setHardwareSlots] = useState<HardwareSlot[]>([]);

  const loadData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);

    try {
      const [reportsResponse, firebaseReadings, sensorStatuses] = await Promise.all([
        api.get('/barangay/reports/mine'),
        loadFirebaseHardwareReadings(),
        loadWaterLevelSensorStatuses(),
      ]);

      const nextReports = (Array.isArray(reportsResponse.data) ? reportsResponse.data : [])
        .filter((item: IncidentReport) => String(item.report_type).toLowerCase() === 'flood');

      setReports((current) => sameData(current, nextReports) ? current : nextReports);

      const latestReports = [...nextReports]
        .sort((first, second) => new Date(second.created_at).getTime() - new Date(first.created_at).getTime())
        .slice(0, 6);

      const nextHardwareSlots: HardwareSlot[] = Array.from({ length: 6 }, (_, index) => {
        const source = latestReports[index] ?? null;
        const hardwareId = `waterSensor${index + 1}`;
        return {
          hardwareId,
          assignedArea: HARDWARE_AREAS[index],
          waterLevelLabel: source ? formatWaterLevelLabel(source.water_level) : 'No Reading',
          fillPct: 0,
          hasReading: false,
          sensorStatus: sensorStatuses[hardwareId] || 'Active',
          reportCode: source?.report_code || null,
          updatedAt: source?.updated_at || source?.created_at || null,
        };
      });

      firebaseReadings.forEach((firebaseReading, index) => {
        const hardwareSlot = nextHardwareSlots[index];
        if (!firebaseReading || !hardwareSlot) return;

        nextHardwareSlots[index] = {
          ...hardwareSlot,
          assignedArea: firebaseReading.barangayName || HARDWARE_AREAS[index],
          waterLevelLabel: typeof firebaseReading.distanceCm === 'number'
            ? `Distance: ${firebaseReading.distanceCm.toFixed(1)} cm`
            : firebaseReading.waterLevelLabel || firebaseReading.waterLevel || hardwareSlot.waterLevelLabel,
          fillPct: typeof firebaseReading.fillPct === 'number'
            ? firebaseReading.fillPct
            : distanceToFillPct(firebaseReading.distanceCm),
          hasReading: typeof firebaseReading.distanceCm === 'number' || typeof firebaseReading.fillPct === 'number',
          temperatureCelsius: firebaseReading.temperatureCelsius,
          humidityPercentage: firebaseReading.humidityPercentage,
          reportCode: firebaseReading.reportCode || hardwareSlot.reportCode,
          updatedAt: firebaseReading.updatedAt || hardwareSlot.updatedAt,
        };
      });

      setHardwareSlots((current) => sameData(current, nextHardwareSlots) ? current : nextHardwareSlots);

      setSelectedReportId((currentId) => {
        if (nextReports.length === 0) return null;
        return nextReports.some((item: IncidentReport) => item.id === currentId)
          ? currentId
          : nextReports[0].id;
      });

      setError(null);
    } catch (caughtError: unknown) {
      const apiError = caughtError as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      setError(apiError.response?.data?.message || 'Failed to load flood monitoring data.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [onAuthError]);

  useEffect(() => {
    loadData(true).catch(() => {});
    const refreshTimer = setInterval(() => loadData(false).catch(() => {}), 10_000);
    return () => clearInterval(refreshTimer);
  }, [loadData]);

  const floodReports = useMemo(() => reports, [reports]);
  const selectedReport = useMemo(
    () => floodReports.find((item) => item.id === selectedReportId) ?? floodReports[0] ?? null,
    [floodReports, selectedReportId],
  );
  const activeFloodReports = useMemo(
    () => floodReports.filter((item) => isActiveFloodStatus(item.status)),
    [floodReports],
  );
  return (
    <BarangayShell
      activeView="flood-monitoring"
      title="Flood Monitoring"
      subtitle={`Flood reports and live water sensors for Barangay ${barangayName}`}
      noMainScroll
      barangayName={barangayName}
      onLogout={onLogout}
      onOpenMonitoring={onOpenMonitoring}
      onOpenFloodMonitoring={() => {}}
      onOpenAccount={onOpenAccount}
      actions={<button onClick={onOpenMonitoring} className={d.monitoring.actionEvac}>Open Incident Monitoring</button>}
    >
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
                  <p className={temperature.className}>
                    <span aria-hidden="true">{temperature.icon}</span>
                    <span>Temperature {typeof slot.temperatureCelsius === 'number' ? `${slot.temperatureCelsius.toFixed(1)}\u00B0C` : '--\u00B0C'}</span>
                  </p>
                  <p className={humidity.className}>
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
              <h3 className={d.monitoring.incidentsTitle}>Flood Reports</h3>
              <p className={d.monitoring.rainRankUpdated}>{activeFloodReports.length} active</p>
            </div>
            <div className={d.monitoring.incidentsTableWrap}>
              <table className={d.monitoring.floodReportsTable}>
                <thead><tr><th>Report ID</th><th>Location</th><th>Status</th><th>Reporter</th><th>Contact</th></tr></thead>
                <tbody>
                  {floodReports.length === 0 ? (
                    <tr><td colSpan={5} className={d.table.empty}>No flood reports yet.</td></tr>
                  ) : floodReports.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedReportId(item.id)}
                      className={[d.monitoring.rowBase, selectedReport?.id === item.id ? d.monitoring.rowSelected : null].filter(Boolean).join(' ')}
                    >
                      <td>{item.report_code || `RPT-${String(item.id).padStart(6, '0')}`}</td>
                      <td className={d.monitoring.rowLocation}>{item.location}</td>
                      <td><span className={d.monitoring.statusChip}>{formatStatus(item.status)}</span></td>
                      <td>{`${item.first_name || ''} ${item.last_name || ''}`.trim() || item.email || '-'}</td>
                      <td>{item.contact_number || '-'}</td>
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
                <p className={d.monitoring.validationCurrent}>Active flood reports: {activeFloodReports.length}</p>
                <p className={d.monitoring.assignNote}>Each rectangle represents one assigned hardware sensor and fills according to its detected water level.</p>
                <p className={d.monitoring.assignNote}>All six Firebase sensors refresh automatically every 10 seconds.</p>
              </div>
            </div>
          </article>
        </section>

        {loading ? <p className={d.page.loading}>Loading flood monitoring data...</p> : null}
      </div>
    </BarangayShell>
  );
}
