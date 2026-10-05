import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RescuerShell from '../components/RescuerShell';
import { api } from '../services/apiClient';
import type { EvacuationAreaItem } from '../types';
import { buildCalambaMapHtml, type Coordinate } from '../utils/calambaMapHtml';

type Props = {
  responderRole: 'rescuer' | 'barangay_rescuer';
  onLogout: () => void;
  onAuthError: () => void;
  onOpenIncidents: () => void;
  onOpenFloodMonitoring: () => void;
  onOpenAccount: () => void;
};

type Assignment = {
  backup_request_id: number;
  id: number;
  report_code: string;
  incident_type: string;
  status: string;
  location: string;
  latitude: number;
  longitude: number;
  resident_location_updated_at?: string | null;
  notes: string | null;
  estimated_people: number | null;
  evacuees_reserved: number;
  assigned_barangay: string;
  evacuation_area_id: number | null;
  evacuation_area_name: string | null;
  evacuation_latitude: number | null;
  evacuation_longitude: number | null;
  reporter_name: string | null;
  reporter_contact: string | null;
  assigned_at: string;
  responder_acknowledged_at: string | null;
  picked_up_at: string | null;
};

type BackupHistory = {
  backup_request_id: number;
  report_code: string;
  incident_type: string;
  status: string;
  location: string;
  assigned_barangay: string;
  evacuation_area_name: string | null;
  reporter_name: string | null;
  assigned_at: string;
  picked_up_at: string | null;
  arrived_at: string;
};

type ApiError = { response?: { status?: number; data?: { message?: string } } };
type LocationUpdate = {
  backupRequestId?: number;
  pickupConfirmed?: boolean;
};

function sameData(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

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

export default function RescuerDashboardPage({ responderRole, onLogout, onAuthError, onOpenIncidents, onOpenFloodMonitoring, onOpenAccount }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [history, setHistory] = useState<BackupHistory[]>([]);
  const [areas, setAreas] = useState<EvacuationAreaItem[]>([]);
  const [areasLoaded, setAreasLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [location, setLocation] = useState<Coordinate | null>(null);
  const [route, setRoute] = useState<Coordinate[]>([]);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lastLocationPush = useRef(0);
  const mapFrameRef = useRef<HTMLIFrameElement | null>(null);
  const lastFocusedRescue = useRef('');
  const [mapReady, setMapReady] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [incidentResponse, historyResponse] = await Promise.all([
        api.get<Assignment[]>('/rescuers/incidents/mine'),
        api.get<BackupHistory[]>('/rescuers/incidents/history'),
      ]);
      const next = Array.isArray(incidentResponse.data) ? incidentResponse.data : [];
      const nextHistory = Array.isArray(historyResponse.data) ? historyResponse.data : [];
      setAssignments((current) => sameData(current, next) ? current : next);
      setHistory((current) => sameData(current, nextHistory) ? current : nextHistory);
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
    let stopped = false;
    api.get<EvacuationAreaItem[]>('/content/evacuation-areas')
      .then(({ data }) => {
        if (!stopped) setAreas(Array.isArray(data) ? data : []);
      })
      .catch((error: unknown) => {
        const err = error as ApiError;
        if (err.response?.status === 401) onAuthError();
        else if (!stopped) setError(err.response?.data?.message || 'Failed to load evacuation areas.');
      })
      .finally(() => { if (!stopped) setAreasLoaded(true); });
    return () => { stopped = true; };
  }, [onAuthError]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('This device does not support location services.');
      return undefined;
    }
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const now = Date.now();
        if (now - lastLocationPush.current < 2_000) return;
        lastLocationPush.current = now;
        const point = { latitude: coords.latitude, longitude: coords.longitude };
        setLocation(point);
        api.patch<LocationUpdate>('/rescuers/location', { ...point, accuracy: coords.accuracy })
          .then(({ data }) => {
            if (data.pickupConfirmed) void loadData();
          })
          .catch(() => {});
      },
      () => setError('Allow device location so the live rescue route can be displayed.'),
      { enableHighAccuracy: true, maximumAge: 1_000, timeout: 12_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [loadData, onAuthError]);

  const selected = useMemo(
    () => assignments.find((item) => item.backup_request_id === selectedId) || assignments[0] || null,
    [assignments, selectedId],
  );

  const destination = useMemo<Coordinate | null>(() => {
    if (!selected?.responder_acknowledged_at) return null;
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

  const incidentPoints = useMemo(() => assignments.map((item) => ({
      reportCode: item.report_code,
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
      status: item.status,
      reportType: 'rescue',
    })).filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)), [assignments]);

  const mapHtml = useMemo(() => areasLoaded ? buildCalambaMapHtml(
    areas,
    null,
    [],
    null,
    null,
    [],
    `${String(api.defaults.baseURL).replace(/\/$/, '')}/flood-risk/calamba/barangays`,
    `${String(api.defaults.baseURL).replace(/\/$/, '')}/flood-risk/calamba/raster`,
    `${String(api.defaults.baseURL).replace(/\/$/, '')}/flood-risk/calamba/rain-impact`,
    `${String(api.defaults.baseURL).replace(/\/$/, '')}/weather/wind-field`,
    { boundary: true, floodHazard: false, evacuationAreas: true, incidentMarkers: true, responderRoute: true, weatherOverlay: false, temperatureOverlay: false, humidityOverlay: false, windOverlay: false },
    responderRole === 'barangay_rescuer' ? 'Your live Barangay Rescuer location' : 'Your live CDRRMD Rescuer location',
    { focusOnIncident: true, focusOnResponder: true, allowLiveRouteUpdates: true, responderKind: responderRole === 'barangay_rescuer' ? 'barangay' : 'cddrmd' },
  ) : '', [areas, areasLoaded, responderRole]);

  const postMapUpdate = useCallback((recenter = false) => {
    if (!mapReady) return;
    mapFrameRef.current?.contentWindow?.postMessage({
      type: 'rescue-map-update',
      responderLocation: location,
      routeCoordinates: route,
      incidentLocation: destination,
      selectedReportCode: selected?.report_code || null,
      incidentPoints,
      recenter,
    }, '*');
  }, [destination, incidentPoints, location, mapReady, route, selected?.report_code]);

  const focusKey = selected ? `${selected.backup_request_id}:${Boolean(selected.responder_acknowledged_at)}:${Boolean(selected.picked_up_at)}` : '';
  useEffect(() => {
    if (!mapReady) return;
    const shouldRecenter = Boolean(focusKey) && lastFocusedRescue.current !== focusKey;
    postMapUpdate(shouldRecenter);
    if (shouldRecenter) lastFocusedRescue.current = focusKey;
    if (!focusKey) lastFocusedRescue.current = '';
  }, [focusKey, mapReady, postMapUpdate]);

  async function acknowledgeDispatch() {
    if (!selected || selected.responder_acknowledged_at || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.patch(`/backup-requests/${selected.backup_request_id}/respond`);
      await loadData();
    } catch (error: unknown) {
      const err = error as ApiError;
      if (err.response?.status === 401) return onAuthError();
      setError(err.response?.data?.message || 'Failed to acknowledge the dispatch.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <RescuerShell responderRole={responderRole} activeView="incidents" title={responderRole === 'barangay_rescuer' ? 'Barangay Rescue Assignments' : 'CDRRMD Backup Assignments'} subtitle="Assigned incidents and live routing" onLogout={onLogout} onOpenIncidents={onOpenIncidents} onOpenFloodMonitoring={onOpenFloodMonitoring} onOpenAccount={onOpenAccount}>
      {error ? <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="relative min-h-[34rem] overflow-hidden rounded-xl border border-slate-300 bg-slate-800 shadow-lg">
          {areasLoaded ? <iframe ref={mapFrameRef} onLoad={() => setMapReady(true)} title="CDRRMD Rescuer live route" srcDoc={mapHtml} className="absolute inset-0 h-full w-full border-0" /> : <p className="p-4 text-sm text-white">Loading rescue map...</p>}
          <button type="button" onClick={() => postMapUpdate(true)} disabled={!selected || !mapReady} className="absolute bottom-4 right-4 z-10 rounded-lg border border-white/40 bg-[#12314b]/95 px-4 py-2 text-sm font-black text-white shadow-lg backdrop-blur hover:bg-[#1f4e79] disabled:cursor-not-allowed disabled:opacity-50">Re-center</button>
        </div>

        <aside className="space-y-3">
          <section className="rounded-xl bg-white p-3 shadow">
            <div className="mb-2"><h2 className="font-black text-[#19374f]">Assigned Incidents</h2><p className="text-xs text-slate-500">{responderRole === 'barangay_rescuer' ? 'Only incidents from your assigned barangay appear here.' : 'Only CDRRMD backup incidents assigned to you appear here.'}</p></div>
            <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-[#12314b] text-white"><tr><th className="px-3 py-2">Incident</th><th className="px-3 py-2">Barangay</th><th className="px-3 py-2">Phase</th></tr></thead>
                <tbody>
                  {assignments.map((item) => (
                    <tr key={item.backup_request_id} onClick={() => setSelectedId(item.backup_request_id)} className={`cursor-pointer border-t border-slate-200 ${selected?.backup_request_id === item.backup_request_id ? 'bg-blue-100' : 'hover:bg-slate-50'}`}>
                      <td className="px-3 py-2 font-bold">{item.report_code}</td><td className="px-3 py-2">{item.assigned_barangay}</td><td className="px-3 py-2 text-xs font-bold text-blue-700">{!item.responder_acknowledged_at ? 'Awaiting acknowledgment' : item.picked_up_at ? 'Evacuation' : 'Response'}</td>
                    </tr>
                  ))}
                  {!assignments.length ? <tr><td colSpan={3} className="px-3 py-6 text-center text-sm text-emerald-700">No active incident assigned.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          {selected ? (
            <section className="rounded-xl bg-white p-4 text-sm shadow">
              <h2 className="font-black text-[#19374f]">{selected.report_code}</h2>
              <div className="mt-3 space-y-1.5"><p><strong>Status:</strong> {selected.status.replace(/_/g, ' ')}</p><p><strong>Resident:</strong> {selected.reporter_name || '-'}</p><p><strong>Contact:</strong> {selected.reporter_contact || '-'}</p><p><strong>People to rescue:</strong> {selected.estimated_people ?? selected.evacuees_reserved ?? 1}</p><p><strong>Incident:</strong> {selected.incident_type.replace(/_/g, ' ')}</p><p><strong>Location:</strong> {selected.location}</p><p><strong>Barangay team:</strong> Barangay {selected.assigned_barangay}</p><p><strong>Evacuation center:</strong> {selected.evacuation_area_name || '-'}</p><p><strong>Distance:</strong> {distanceKm ? `${distanceKm.toFixed(2)} km` : 'Calculating...'}</p><p><strong>ETA:</strong> {etaMinutes ? `${etaMinutes} minutes` : 'Calculating...'}</p></div>
              <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">{!selected.responder_acknowledged_at ? 'Acknowledge this dispatch to activate live routing to the resident.' : selected.picked_up_at ? `Navigate the resident to ${selected.evacuation_area_name}. Barangay Evacuation Personnel will confirm arrival and resolve the report.` : responderRole === 'barangay_rescuer' ? 'Follow the shortest road route to the resident. GPS proximity will start the rescue automatically.' : 'Follow the shortest road route to the resident as CDRRMD backup. GPS proximity will start the rescue automatically.'}</div>
              {!selected.responder_acknowledged_at ? <button disabled={busy} onClick={() => void acknowledgeDispatch()} className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-3 font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Confirming...' : 'Acknowledge Dispatch'}</button> : null}
            </section>
          ) : null}
        </aside>
      </section>

      <section className="mt-3 rounded-xl bg-white p-3 shadow">
        <div className="mb-2 flex items-center justify-between gap-3"><div><h2 className="font-black text-[#19374f]">Assignment History</h2><p className="text-xs text-slate-500">Completed {responderRole === 'barangay_rescuer' ? 'Barangay Rescuer' : 'CDRRMD backup'} assignments</p></div><span className="text-xs font-bold text-slate-500">{history.length} completed</span></div>
        <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="sticky top-0 bg-[#12314b] text-white"><tr><th className="px-3 py-2">Incident</th><th className="px-3 py-2">Resident</th><th className="px-3 py-2">Barangay</th><th className="px-3 py-2">Location</th><th className="px-3 py-2">Evacuation Area</th><th className="px-3 py-2">Completed</th></tr></thead>
            <tbody>
              {history.map((item) => <tr key={item.backup_request_id} className="border-t border-slate-200"><td className="px-3 py-2 font-bold">{item.report_code}</td><td className="px-3 py-2">{item.reporter_name || '-'}</td><td className="px-3 py-2">{item.assigned_barangay}</td><td className="px-3 py-2">{item.location}</td><td className="px-3 py-2">{item.evacuation_area_name || '-'}</td><td className="whitespace-nowrap px-3 py-2">{new Date(item.arrived_at).toLocaleString()}</td></tr>)}
              {!history.length ? <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">No completed backup assignments yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </RescuerShell>
  );
}
