import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import cdrrmdLogo from '../assets/cdrrmd-logo.png';
import { api } from '../services/apiClient';
import type { EvacuationAreaItem } from '../types';
import { buildCalambaMapHtml, type Coordinate } from '../utils/calambaMapHtml';

type Props = { onLogout: () => void; onAuthError: () => void };

type Assignment = {
  backup_request_id: number;
  id: number;
  report_code: string;
  incident_type: string;
  status: string;
  location: string;
  latitude: number;
  longitude: number;
  notes: string | null;
  assigned_barangay: string;
  evacuation_area_id: number | null;
  evacuation_area_name: string | null;
  evacuation_latitude: number | null;
  evacuation_longitude: number | null;
  reporter_name: string | null;
  reporter_contact: string | null;
  assigned_at: string;
  picked_up_at: string | null;
};

type ApiError = { response?: { status?: number; data?: { message?: string } } };

async function fetchShortestRoute(from: Coordinate, to: Coordinate) {
  const response = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson&alternatives=true&steps=false`,
  );
  if (!response.ok) throw new Error('Route service unavailable.');
  const data = await response.json() as { routes?: Array<{ distance: number; duration: number; geometry: { coordinates: number[][] } }> };
  const route = data.routes?.filter((item) => item.geometry?.coordinates?.length).sort((a, b) => a.distance - b.distance)[0];
  if (!route) throw new Error('No road route found.');
  return {
    coordinates: route.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })),
    distanceKm: route.distance / 1000,
    etaMinutes: Math.max(1, Math.round(route.duration / 60)),
  };
}

export default function RescuerDashboardPage({ onLogout, onAuthError }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [areas, setAreas] = useState<EvacuationAreaItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [location, setLocation] = useState<Coordinate | null>(null);
  const [route, setRoute] = useState<Coordinate[]>([]);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lastLocationPush = useRef(0);

  const loadData = useCallback(async () => {
    try {
      const [incidentResponse, areaResponse] = await Promise.all([
        api.get<Assignment[]>('/rescuers/incidents/mine'),
        api.get<EvacuationAreaItem[]>('/content/evacuation-areas'),
      ]);
      const next = Array.isArray(incidentResponse.data) ? incidentResponse.data : [];
      setAssignments(next);
      setAreas(Array.isArray(areaResponse.data) ? areaResponse.data : []);
      setSelectedId((current) => next.some((item) => item.backup_request_id === current) ? current : next[0]?.backup_request_id ?? null);
    } catch (error: unknown) {
      const err = error as ApiError;
      if (err.response?.status === 401) return onAuthError();
      setError(err.response?.data?.message || 'Failed to load assigned incidents.');
    }
  }, [onAuthError]);

  useEffect(() => {
    void loadData();
    const timer = window.setInterval(() => void loadData(), 5_000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('This device does not support location services.');
      return undefined;
    }
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const point = { latitude: coords.latitude, longitude: coords.longitude };
        setLocation(point);
        const now = Date.now();
        if (now - lastLocationPush.current >= 2_000) {
          lastLocationPush.current = now;
          api.patch('/rescuers/location', point).catch(() => {});
        }
      },
      () => setError('Allow device location so the live rescue route can be displayed.'),
      { enableHighAccuracy: true, maximumAge: 1_000, timeout: 12_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const selected = useMemo(
    () => assignments.find((item) => item.backup_request_id === selectedId) || assignments[0] || null,
    [assignments, selectedId],
  );

  const destination = useMemo<Coordinate | null>(() => {
    if (!selected) return null;
    if (selected.picked_up_at) {
      const latitude = Number(selected.evacuation_latitude);
      const longitude = Number(selected.evacuation_longitude);
      return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
    }
    const latitude = Number(selected.latitude);
    const longitude = Number(selected.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  }, [selected]);

  useEffect(() => {
    let cancelled = false;
    if (!location || !destination) {
      setRoute([]);
      setDistanceKm(null);
      setEtaMinutes(null);
      return undefined;
    }
    void fetchShortestRoute(location, destination)
      .then((result) => {
        if (cancelled) return;
        setRoute(result.coordinates);
        setDistanceKm(result.distanceKm);
        setEtaMinutes(result.etaMinutes);
      })
      .catch(() => {
        if (cancelled) return;
        setRoute([location, destination]);
        setDistanceKm(null);
        setEtaMinutes(null);
      });
    return () => { cancelled = true; };
  }, [location, destination]);

  const mapHtml = useMemo(() => buildCalambaMapHtml(
    areas,
    location,
    route,
    destination,
    selected?.report_code || null,
    assignments.map((item) => ({
      reportCode: item.report_code,
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
      status: item.status,
      reportType: 'rescue',
    })).filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)),
    `${String(api.defaults.baseURL).replace(/\/$/, '')}/flood-risk/calamba/barangays`,
    `${String(api.defaults.baseURL).replace(/\/$/, '')}/flood-risk/calamba/raster`,
    `${String(api.defaults.baseURL).replace(/\/$/, '')}/flood-risk/calamba/rain-impact`,
    `${String(api.defaults.baseURL).replace(/\/$/, '')}/weather/wind-field`,
    { boundary: true, floodHazard: false, evacuationAreas: true, incidentMarkers: true, responderRoute: true, weatherOverlay: false, windOverlay: false },
    'Your live CDRRMD Rescuer location',
  ), [areas, assignments, destination, location, route, selected]);

  async function advanceRescue() {
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    try {
      if (selected.picked_up_at) await api.patch(`/backup-requests/${selected.backup_request_id}/complete`);
      else await api.patch(`/backup-requests/${selected.backup_request_id}/pickup`);
      await loadData();
    } catch (error: unknown) {
      const err = error as ApiError;
      if (err.response?.status === 401) return onAuthError();
      setError(err.response?.data?.message || 'Failed to update the rescue operation.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-[#12314b] px-4 py-3 text-white shadow-lg sm:px-6">
        <div className="flex items-center gap-3"><img src={cdrrmdLogo} alt="CDRRMD" className="h-12 w-12 rounded-full bg-white p-1" /><div><h1 className="text-lg font-black">CDRRMD Rescuer</h1><p className="text-xs text-blue-100">Assigned Incident Reports and Live Routing</p></div></div>
        <button onClick={onLogout} className="rounded-lg border border-white/40 px-4 py-2 text-sm font-bold hover:bg-white/10">Logout</button>
      </header>
      <main className="mx-auto grid max-w-[1600px] gap-4 p-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <section className="rounded-xl bg-white p-4 shadow">
            <h2 className="font-black text-[#19374f]">Assigned Incidents</h2>
            <p className="mt-1 text-xs text-slate-500">Barangay responders remain active and cooperate with your team.</p>
            <div className="mt-3 space-y-2">
              {assignments.map((item) => (
                <button key={item.backup_request_id} onClick={() => setSelectedId(item.backup_request_id)} className={`w-full rounded-lg border p-3 text-left ${selected?.backup_request_id === item.backup_request_id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <strong className="block">{item.report_code}</strong>
                  <span className="block text-xs text-slate-600">Barangay {item.assigned_barangay}</span>
                  <span className="mt-1 block text-xs font-bold text-blue-700">{item.picked_up_at ? 'To evacuation center' : 'To resident'}</span>
                </button>
              ))}
              {!assignments.length ? <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">No active incident assigned. You are available for dispatch.</p> : null}
            </div>
          </section>
          {selected ? (
            <section className="rounded-xl bg-white p-4 text-sm shadow">
              <h2 className="font-black text-[#19374f]">{selected.report_code}</h2>
              <div className="mt-3 space-y-1.5"><p><strong>Resident:</strong> {selected.reporter_name || '-'}</p><p><strong>Contact:</strong> {selected.reporter_contact || '-'}</p><p><strong>Incident:</strong> {selected.incident_type.replace(/_/g, ' ')}</p><p><strong>Location:</strong> {selected.location}</p><p><strong>Barangay team:</strong> Barangay {selected.assigned_barangay}</p><p><strong>Evacuation center:</strong> {selected.evacuation_area_name || '-'}</p><p><strong>Distance:</strong> {distanceKm ? `${distanceKm.toFixed(2)} km` : 'Calculating...'}</p><p><strong>ETA:</strong> {etaMinutes ? `${etaMinutes} minutes` : 'Calculating...'}</p></div>
              <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">{selected.picked_up_at ? `Navigate the resident to ${selected.evacuation_area_name}. Complete only after safe arrival.` : 'Follow the shortest road route to the resident. The Barangay team continues responding with you.'}</div>
              <button disabled={busy || !location} onClick={() => void advanceRescue()} className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-3 font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Updating...' : selected.picked_up_at ? 'Confirm Safe Arrival' : 'Confirm Resident Pickup'}</button>
            </section>
          ) : null}
          {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        </aside>
        <section className="relative min-h-[70vh] overflow-hidden rounded-xl border border-slate-300 bg-slate-800 shadow-lg"><iframe title="CDRRMD Rescuer live route" srcDoc={mapHtml} className="absolute inset-0 h-full w-full border-0" /></section>
      </main>
    </div>
  );
}
