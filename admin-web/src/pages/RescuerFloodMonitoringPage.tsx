import { useCallback, useEffect, useState } from 'react';
import RescuerShell from '../components/RescuerShell';
import { d } from '../adminDesign';
import { api } from '../services/apiClient';
import { loadWaterLevelSensors, type WaterLevelSensor } from '../services/waterLevelSensors';

type Props = {
  onLogout: () => void;
  onAuthError: () => void;
  onOpenIncidents: () => void;
  onOpenFloodMonitoring: () => void;
  onOpenAccount: () => void;
};

type FloodReport = {
  id: number;
  report_code: string;
  location: string;
  water_level: string | null;
  status: string;
  assigned_barangay: string | null;
  reporter_name: string | null;
  contact_number: string | null;
};

const FLOOD_REPORT_THRESHOLD = 40;
const HIGH_WATER_THRESHOLD = 61;

function temperatureStatus(value: number | null) {
  if (value === null) return { icon: '\u2014', className: 'climate-badge-unavailable' };
  if (value < 25) return { icon: '\u2744\uFE0F', className: 'climate-badge-cold' };
  if (value < 32) return { icon: '\u2600\uFE0F', className: 'climate-badge-warm' };
  return { icon: '\uD83D\uDD25', className: 'climate-badge-hot' };
}

function humidityStatus(value: number | null) {
  if (value === null) return { icon: '\u2014', className: 'climate-badge-unavailable' };
  if (value < 40) return { icon: '\uD83D\uDCA7', className: 'climate-badge-humidity-low' };
  if (value < 70) return { icon: '\uD83D\uDCA6', className: 'climate-badge-humidity-moderate' };
  return { icon: '\uD83C\uDF0A', className: 'climate-badge-humidity-high' };
}

export default function RescuerFloodMonitoringPage(props: Props) {
  const { onAuthError } = props;
  const [sensors, setSensors] = useState<WaterLevelSensor[]>([]);
  const [reports, setReports] = useState<FloodReport[]>([]);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [next, reportsResponse] = await Promise.all([
        loadWaterLevelSensors(),
        api.get<FloodReport[]>('/rescuers/flood-reports'),
      ]);
      setSensors((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
      const nextReports = Array.isArray(reportsResponse.data) ? reportsResponse.data : [];
      setReports((current) => JSON.stringify(current) === JSON.stringify(nextReports) ? current : nextReports);
      setError('');
    } catch (caught: unknown) {
      const apiError = caught as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) onAuthError();
      else setError(apiError.response?.data?.message || 'Unable to load flood monitoring data.');
    }
  }, [onAuthError]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void loadData(), 0);
    const timer = window.setInterval(() => void loadData(), 10_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [loadData]);

  return (
    <RescuerShell activeView="flood-monitoring" title="Flood Monitoring" subtitle="Live water levels for rescue operations" {...props}>
      <div className={d.monitoring.root}>
        {error ? <div className={d.page.error}>{error}</div> : null}
        <section className={d.monitoring.floodIndicatorsCard}>
          <div className={d.monitoring.floodIndicatorsHead}>
            <h3 className={d.monitoring.floodIndicatorsTitle}>Water Level Indicators</h3>
            <p className={d.monitoring.rainRankUpdated}>{sensors.filter((sensor) => sensor.status === 'Active' && sensor.waterLevelPercentage >= HIGH_WATER_THRESHOLD).length} high-level slots</p>
          </div>
          <div className={d.monitoring.floodSensorGrid}>
            {sensors.map((sensor) => {
              const temperature = temperatureStatus(sensor.temperatureCelsius);
              const humidity = humidityStatus(sensor.humidityPercentage);
              return (
                <article key={sensor.id} className={d.monitoring.floodSensorCard}>
                  <p className={d.monitoring.floodSensorName}>Brgy. {sensor.barangayName}</p>
                  <div className={[d.monitoring.floodSensorGauge, sensor.status === 'Unavailable' ? 'water-gauge-unavailable' : sensor.waterLevelPercentage >= HIGH_WATER_THRESHOLD ? 'water-gauge-high' : sensor.waterLevelPercentage >= FLOOD_REPORT_THRESHOLD ? 'water-gauge-moderate' : 'water-gauge-low'].join(' ')} style={{ background: sensor.status === 'Unavailable' ? 'linear-gradient(180deg, #d1d5db 0%, #94a3b8 100%)' : 'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)' }}>
                    {sensor.status === 'Unavailable' ? <span className="sensor-unavailable-mark" aria-label="Sensor unavailable">/</span> : <div className="water-gauge-fill" style={{ width: '100%', height: `${Math.max(0, Math.min(100, sensor.waterLevelPercentage))}%`, borderRadius: '0.75rem', background: sensor.waterLevelPercentage >= HIGH_WATER_THRESHOLD ? 'linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)' : sensor.waterLevelPercentage >= FLOOD_REPORT_THRESHOLD ? 'linear-gradient(180deg, #f59e0b 0%, #d97706 100%)' : 'linear-gradient(180deg, #38bdf8 0%, #0284c7 100%)' }}><span className="water-gauge-surface" aria-hidden="true" /></div>}
                  </div>
                  <div className="sensor-reading-details">
                    <strong className="sensor-water-percentage">{sensor.status === 'Unavailable' ? 'Unavailable' : `${sensor.waterLevelPercentage.toFixed(0)}%`}</strong>
                    <p className={temperature.className}><span aria-hidden="true">{temperature.icon}</span><span>Temperature {sensor.temperatureCelsius === null ? '--\u00B0C' : `${sensor.temperatureCelsius.toFixed(1)}\u00B0C`}</span></p>
                    <p className={humidity.className}><span aria-hidden="true">{humidity.icon}</span><span>Humidity {sensor.humidityPercentage === null ? '--%' : `${sensor.humidityPercentage.toFixed(0)}%`}</span></p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className={d.monitoring.lowerGrid}>
          <article className={d.monitoring.incidentsCard}>
            <div className={d.monitoring.incidentsHead}><h3 className={d.monitoring.incidentsTitle}>Flood Reports</h3><p className={d.monitoring.rainRankUpdated}>Read-only monitoring</p></div>
            <div className={d.monitoring.incidentsTableWrap}>
              <table className={d.monitoring.floodReportsTable}>
                <thead><tr><th>Report ID</th><th>Barangay</th><th>Location</th><th>Water Level</th><th>Status</th><th>Reporter</th></tr></thead>
                <tbody>
                  {reports.map((report) => <tr key={report.id}><td>{report.report_code}</td><td>{report.assigned_barangay || '-'}</td><td>{report.location}</td><td>{report.water_level || '-'}</td><td><span className={d.monitoring.statusChip}>{report.status.replace(/_/g, ' ')}</span></td><td>{report.reporter_name || '-'}</td></tr>)}
                  {!reports.length ? <tr><td colSpan={6} className={d.table.empty}>No flood reports yet.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </article>
          <article className={d.monitoring.validationCard}><h3 className={d.monitoring.validationTitle}>Flood Watch Notes</h3><div className={d.monitoring.validationScrollWrap}><div className={d.monitoring.validationStack}><p className={d.monitoring.validationCurrent}>Flood reports: {reports.length}</p><p className={d.monitoring.assignNote}>Sensor readings and flood reports refresh automatically every 10 seconds.</p><p className={d.monitoring.assignNote}>CDRRMD Rescuers have read-only access to flood monitoring.</p></div></div></article>
        </section>
        {!sensors.length && !error ? <p className={d.page.loading}>Loading flood monitoring data...</p> : null}
      </div>
    </RescuerShell>
  );
}
