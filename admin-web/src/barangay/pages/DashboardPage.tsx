import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE_URL, api } from '../../services/apiClient';
import type { EvacuationAreaItem } from '../../types';
import { buildCalambaMapHtml } from '../../utils/calambaMapHtml';
import BarangayShell from '../components/BarangayShell';
import { loadWaterLevelSensors, type WaterLevelSensor } from '../services/waterLevelSensors';

type Props = {
  barangayName: string;
  onLogout: () => void;
  onAuthError: () => void;
  onOpenMonitoring: () => void;
  onOpenFloodMonitoring: () => void;
  onOpenEvacuationCenter: () => void;
  onOpenAccount: () => void;
};

type Incident = {
  id: number;
  report_code?: string | null;
  incident_type?: string | null;
  report_type?: string | null;
  status: string;
  location: string;
  latitude?: number | null;
  longitude?: number | null;
  estimated_people?: number | null;
  created_at: string;
};

type Center = {
  id: number;
  name: string;
  barangay: string;
  place_type?: string | null;
  address?: string | null;
  latitude: number;
  longitude: number;
  current_count: number;
  capacity: number;
  remaining_capacity: number;
  is_active: boolean;
  created_at: string;
};

function statusLabel(value: string) {
  return String(value || 'pending').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sensorTone(sensor: WaterLevelSensor | null) {
  if (!sensor || sensor.status === 'Unavailable' || !sensor.hasReading) return 'bg-slate-400';
  if (sensor.waterLevelPercentage >= 75) return 'bg-red-500';
  if (sensor.waterLevelPercentage >= 50) return 'bg-orange-500';
  if (sensor.waterLevelPercentage >= 25) return 'bg-amber-400';
  return 'bg-emerald-500';
}

export default function DashboardPage({ barangayName, onLogout, onAuthError, onOpenMonitoring, onOpenFloodMonitoring, onOpenEvacuationCenter, onOpenAccount }: Props) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [sensor, setSensor] = useState<WaterLevelSensor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const [incidentResponse, centerResponse, sensors] = await Promise.all([
        api.get<Incident[]>('/barangay/reports/mine'),
        api.get<Center[]>('/barangay/evacuation-centers'),
        loadWaterLevelSensors(),
      ]);
      setIncidents(Array.isArray(incidentResponse.data) ? incidentResponse.data : []);
      setCenters(Array.isArray(centerResponse.data) ? centerResponse.data : []);
      setSensor(sensors.find((item) => item.barangayName.toLowerCase() === barangayName.trim().toLowerCase()) || null);
      setError('');
    } catch (requestError: unknown) {
      const status = (requestError as { response?: { status?: number } })?.response?.status;
      if (status === 401) return onAuthError();
      setError('Unable to refresh the Barangay dashboard. Retrying shortly.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [barangayName, onAuthError]);

  useEffect(() => {
    void loadDashboard(true);
    const timer = window.setInterval(() => void loadDashboard(), 5_000);
    return () => window.clearInterval(timer);
  }, [loadDashboard]);

  const incidentSummary = useMemo(() => ({
    active: incidents.filter((item) => ['pending', 'accepted', 'in_progress'].includes(String(item.status).toLowerCase())).length,
    pending: incidents.filter((item) => String(item.status).toLowerCase() === 'pending').length,
    inProgress: incidents.filter((item) => ['accepted', 'in_progress'].includes(String(item.status).toLowerCase())).length,
    resolved: incidents.filter((item) => String(item.status).toLowerCase() === 'resolved').length,
  }), [incidents]);

  const recentIncidents = useMemo(() => [...incidents]
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .slice(0, 8), [incidents]);

  const floodLevel = sensor?.hasReading ? Math.round(sensor.waterLevelPercentage) : 0;
  const mapHtml = useMemo(() => buildCalambaMapHtml(
    centers.map<EvacuationAreaItem>((center) => ({
      id: center.id,
      name: center.name,
      barangay: center.barangay,
      place_type: center.place_type,
      address: center.address,
      latitude: Number(center.latitude),
      longitude: Number(center.longitude),
      capacity: Number(center.capacity),
      evacuees: Number(center.current_count),
      available_slots: Number(center.remaining_capacity),
      is_active: center.is_active,
      created_at: center.created_at,
    })).filter((center) => Number.isFinite(center.latitude) && Number.isFinite(center.longitude)),
    null, [], null, null,
    incidents
      .filter((incident) => ['pending', 'accepted', 'in_progress'].includes(String(incident.status).toLowerCase()))
      .map((incident) => ({
        reportCode: incident.report_code || `RPT-${String(incident.id).padStart(6, '0')}`,
        latitude: Number(incident.latitude),
        longitude: Number(incident.longitude),
        status: incident.status,
        reportType: incident.report_type || 'rescue',
      }))
      .filter((incident) => Number.isFinite(incident.latitude) && Number.isFinite(incident.longitude)),
    `${API_BASE_URL.replace(/\/$/, '')}/flood-risk/calamba/barangays`, '',
    `${API_BASE_URL.replace(/\/$/, '')}/flood-risk/calamba/rain-impact`,
    `${API_BASE_URL.replace(/\/$/, '')}/weather/wind-field`,
    { boundary: true, floodHazard: false, evacuationAreas: true, incidentMarkers: true, responderRoute: false, weatherOverlay: false, temperatureOverlay: false, humidityOverlay: false, windOverlay: false },
    'Closest responder base',
    { jurisdictionBarangayName: barangayName },
  ), [barangayName, centers, incidents]);

  return (
    <BarangayShell activeView="dashboard" title="Barangay Dashboard" subtitle={`Live operations overview for Barangay ${barangayName}`}
      barangayName={barangayName} onLogout={onLogout} onOpenDashboard={() => {}} onOpenMonitoring={onOpenMonitoring}
      onOpenFloodMonitoring={onOpenFloodMonitoring} onOpenEvacuationCenter={onOpenEvacuationCenter} onOpenAccount={onOpenAccount}>
      <div className="space-y-3 bg-[#eaf3fb] px-3 pb-3 pt-0 sm:px-4 sm:pb-4 sm:pt-0">
        {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Active Incidents', incidentSummary.active, 'border-rose-400', 'text-rose-600'],
            ['Pending Review', incidentSummary.pending, 'border-sky-400', 'text-sky-600'],
            ['Response Active', incidentSummary.inProgress, 'border-amber-400', 'text-amber-600'],
            ['Resolved', incidentSummary.resolved, 'border-emerald-400', 'text-emerald-600'],
          ].map(([label, value, border, tone]) => <article key={String(label)} className={`rounded-xl border border-slate-200 border-t-4 ${border} bg-white px-4 py-3 shadow-sm`}><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-1 text-3xl font-black ${tone}`}>{value}</p></article>)}
        </section>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.72fr)] 2xl:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.72fr)_minmax(320px,0.85fr)]">
          <article className="flex min-h-[32rem] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><h2 className="font-black text-[#173750]">Incident Reports Overview</h2><p className="text-xs text-slate-500">Latest reports from Barangay {barangayName}</p></div><button onClick={onOpenMonitoring} className="rounded-lg bg-[#1f567d] px-3 py-2 text-xs font-bold text-white hover:bg-[#174866]">View all</button></div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[0.7rem] uppercase tracking-wide text-slate-600"><tr><th className="px-4 py-3">Case ID</th><th className="px-4 py-3">Incident</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">People</th><th className="px-4 py-3">Status</th></tr></thead>
                <tbody>{recentIncidents.map((item) => <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50"><td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-bold text-[#173750]">{item.report_code || `RPT-${String(item.id).padStart(6, '0')}`}</td><td className="px-4 py-3">{item.incident_type || 'Incident'}</td><td className="max-w-[16rem] truncate px-4 py-3" title={item.location}>{item.location}</td><td className="px-4 py-3">{item.estimated_people ?? '—'}</td><td className="px-4 py-3"><span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">{statusLabel(item.status)}</span></td></tr>)}</tbody>
              </table>
              {!recentIncidents.length ? <p className="p-10 text-center text-sm text-slate-500">{loading ? 'Loading incidents…' : 'No incidents recorded.'}</p> : null}
            </div>
          </article>

          <article className="flex min-h-[32rem] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><h2 className="font-black text-[#173750]">Evacuation Area Status</h2><p className="text-xs text-slate-500">Current occupancy and remaining space</p></div><button onClick={onOpenEvacuationCenter} className="text-xs font-black text-[#1f567d] hover:underline">Manage</button></div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">{centers.map((center) => {
              const occupancy = center.capacity > 0 ? Math.min(100, Math.round((center.current_count / center.capacity) * 100)) : 100;
              return <article key={center.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-black text-slate-900" title={center.name}>{center.name}</h3><p className="text-xs text-slate-500">Barangay {center.barangay}</p></div><span className="whitespace-nowrap text-xs font-bold text-slate-600">{center.current_count}/{center.capacity}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${occupancy >= 90 ? 'bg-red-500' : occupancy >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${occupancy}%` }} /></div><div className="mt-2 flex justify-between text-[0.68rem] font-semibold text-slate-500"><span>{center.current_count} evacuees</span><span>{center.remaining_capacity} remaining</span></div></article>;
            })}{!centers.length ? <p className="py-8 text-center text-sm text-slate-500">{loading ? 'Loading evacuation centers…' : 'No evacuation center assigned.'}</p> : null}</div>
          </article>

          <article className="min-h-[32rem] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm xl:col-span-2 2xl:col-span-1">
            <div className="border-b border-slate-200 px-4 py-3"><h2 className="font-black text-[#173750]">Operations Map</h2><p className="text-xs text-slate-500">Active residents and evacuation centers</p></div>
            <iframe title="Barangay dashboard operations map" srcDoc={mapHtml} className="h-[27.5rem] w-full border-0" />
          </article>
        </section>

        <section className="rounded-xl border border-cyan-200 bg-cyan-50/70 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black text-[#173750]">Flood Monitoring</h2><p className="text-xs text-slate-500">Live water conditions for Barangay {barangayName}</p></div><button onClick={onOpenFloodMonitoring} className="rounded-lg border border-[#1f567d] px-3 py-2 text-xs font-black text-[#1f567d] hover:bg-white">View details</button></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-white p-3"><p className="text-[0.68rem] font-bold uppercase text-slate-500">Water level</p><p className="mt-1 text-2xl font-black text-[#173750]">{sensor?.hasReading ? `${floodLevel}%` : '—'}</p></div>
            <div className="rounded-lg bg-white p-3"><p className="text-[0.68rem] font-bold uppercase text-slate-500">Sensor distance</p><p className="mt-1 text-2xl font-black text-[#173750]">{sensor?.hasReading ? `${sensor.distanceCm?.toFixed(1) ?? '—'} cm` : '—'}</p></div>
            <div className="rounded-lg bg-white p-3"><p className="text-[0.68rem] font-bold uppercase text-slate-500">Sensor status</p><p className="mt-1 text-2xl font-black text-[#173750]">{sensor?.status || 'Unavailable'}</p></div>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-white"><div className={`h-full rounded-full transition-all ${sensorTone(sensor)}`} style={{ width: `${floodLevel}%` }} /></div>
        </section>
      </div>
    </BarangayShell>
  );
}
