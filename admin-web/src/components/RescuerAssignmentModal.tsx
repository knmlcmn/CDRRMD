import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../services/apiClient';
import { fetchRoadRoute, type RoadCoordinate } from '../services/roadRouting';

type ResponderRole = 'rescuer' | 'barangay_rescuer';

type Assignment = {
  backup_request_id: number;
  report_code: string;
  incident_type: string;
  location: string;
  latitude: number;
  longitude: number;
  reported_latitude?: number | null;
  reported_longitude?: number | null;
  reporter_name: string | null;
  reporter_contact: string | null;
  estimated_people: number | null;
  evacuees_reserved: number;
  assigned_barangay: string;
  evacuation_area_name: string | null;
  responder_acknowledged_at: string | null;
};

type ApiError = { response?: { status?: number; data?: { message?: string } } };
type RouteState = {
  coordinates: RoadCoordinate[];
  distanceKm: number | null;
  etaMinutes: number | null;
  status: 'waiting-location' | 'loading' | 'ready' | 'unavailable';
};

type Props = {
  responderRole: ResponderRole;
  onAuthError: () => void;
  onOpenIncidents: () => void;
};

function markerIcon(color: string, label: string) {
  return L.divIcon({
    className: '',
    html: `<div style="display:grid;place-items:center;width:34px;height:34px;border:3px solid white;border-radius:50% 50% 50% 0;background:${color};color:white;font:800 13px system-ui;box-shadow:0 3px 9px rgba(15,23,42,.35);transform:rotate(-45deg)"><span style="transform:rotate(45deg)">${label}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 32],
  });
}

function AssignmentRouteMap({ origin, destination, route, status }: {
  origin: RoadCoordinate | null;
  destination: RoadCoordinate;
  route: RoadCoordinate[];
  status: RouteState['status'];
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!hostRef.current) return undefined;
    const map = L.map(hostRef.current, { attributionControl: false, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    const layers = L.layerGroup().addTo(map);
    mapRef.current = map;
    routeLayerRef.current = layers;
    map.setView([destination.latitude, destination.longitude], 15);
    window.setTimeout(() => map.invalidateSize(), 80);
    return () => {
      map.remove();
      mapRef.current = null;
      routeLayerRef.current = null;
    };
  }, [destination.latitude, destination.longitude]);

  useEffect(() => {
    const map = mapRef.current;
    const layers = routeLayerRef.current;
    if (!map || !layers) return;
    layers.clearLayers();

    const residentPoint = L.latLng(destination.latitude, destination.longitude);
    L.marker(residentPoint, { icon: markerIcon('#dc2626', 'R'), zIndexOffset: 1200 })
      .addTo(layers)
      .bindTooltip('Resident pinpointed location', { direction: 'top' });

    if (!origin) {
      map.setView(residentPoint, 15);
      return;
    }

    const rescuerPoint = L.latLng(origin.latitude, origin.longitude);
    L.marker(rescuerPoint, { icon: markerIcon('#15803d', 'You'), zIndexOffset: 1300 })
      .addTo(layers)
      .bindTooltip('Your current location', { direction: 'top' });

    const bounds = L.latLngBounds([rescuerPoint, residentPoint]);
    if (route.length > 1) {
      const roadLine = L.polyline(route.map((point) => L.latLng(point.latitude, point.longitude)), {
        color: '#2389ed',
        weight: 6,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(layers);
      bounds.extend(roadLine.getBounds());
    }
    map.fitBounds(bounds, { maxZoom: 17, padding: [42, 42] });
    window.setTimeout(() => map.invalidateSize(), 50);
  }, [destination.latitude, destination.longitude, origin, route]);

  const message = status === 'waiting-location'
    ? 'Waiting for your GPS location…'
    : status === 'loading'
      ? 'Calculating shortest road route…'
      : status === 'unavailable'
        ? 'Shortest road route is temporarily unavailable.'
        : '';

  return (
    <div className="relative h-full min-h-[19rem] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      <div ref={hostRef} className="absolute inset-0" aria-label="Shortest road route from rescuer to resident" />
      {message ? <p className="absolute bottom-3 left-3 z-[500] rounded-lg bg-slate-900/85 px-3 py-2 text-xs font-bold text-white shadow">{message}</p> : null}
    </div>
  );
}

export default function RescuerAssignmentModal({ responderRole, onAuthError, onOpenIncidents }: Props) {
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [location, setLocation] = useState<RoadCoordinate | null>(null);
  const [route, setRoute] = useState<RouteState>({ coordinates: [], distanceKm: null, etaMinutes: null, status: 'waiting-location' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const knownAssignmentIds = useRef<Set<number> | null>(null);
  const dismissedAssignmentIds = useRef(new Set<number>());

  const loadAssignments = useCallback(async () => {
    try {
      const { data } = await api.get<Assignment[]>('/rescuers/incidents/mine');
      const active = (Array.isArray(data) ? data : []).filter((item) => !item.responder_acknowledged_at);
      const previousIds = knownAssignmentIds.current;
      const candidate = previousIds === null
        ? active.find((item) => !dismissedAssignmentIds.current.has(item.backup_request_id))
        : active.find((item) => !previousIds.has(item.backup_request_id) && !dismissedAssignmentIds.current.has(item.backup_request_id));
      knownAssignmentIds.current = new Set(active.map((item) => item.backup_request_id));
      setAssignment((current) => {
        if (current) return active.find((item) => item.backup_request_id === current.backup_request_id) || candidate || null;
        return candidate || null;
      });
    } catch (caught: unknown) {
      const apiError = caught as ApiError;
      if (apiError.response?.status === 401) onAuthError();
    }
  }, [onAuthError]);

  useEffect(() => {
    void loadAssignments();
    const timer = window.setInterval(() => void loadAssignments(), 5_000);
    return () => window.clearInterval(timer);
  }, [loadAssignments]);

  useEffect(() => {
    if (!assignment) {
      setLocation(null);
      return undefined;
    }
    if (!navigator.geolocation) {
      setError('This device does not support location services.');
      return undefined;
    }
    const options: PositionOptions = { enableHighAccuracy: true, maximumAge: 1_000, timeout: 12_000 };
    const onPosition = ({ coords }: GeolocationPosition) => {
      setLocation({ latitude: coords.latitude, longitude: coords.longitude });
      setError('');
    };
    const onLocationError = () => setError('Allow device location to display the road route to the resident.');
    navigator.geolocation.getCurrentPosition(onPosition, onLocationError, options);
    const watchId = navigator.geolocation.watchPosition(onPosition, onLocationError, options);
    return () => navigator.geolocation.clearWatch(watchId);
  }, [assignment]);

  const destination = useMemo<RoadCoordinate | null>(() => {
    if (!assignment) return null;
    const latitude = Number(assignment.reported_latitude ?? assignment.latitude);
    const longitude = Number(assignment.reported_longitude ?? assignment.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  }, [assignment]);

  useEffect(() => {
    let cancelled = false;
    if (!location || !destination) {
      setRoute({ coordinates: [], distanceKm: null, etaMinutes: null, status: 'waiting-location' });
      return undefined;
    }
    setRoute((current) => ({ ...current, status: 'loading' }));
    void fetchRoadRoute(location, destination)
      .then((result) => {
        if (!cancelled) setRoute({ ...result, status: 'ready' });
      })
      .catch(() => {
        if (!cancelled) setRoute({ coordinates: [], distanceKm: null, etaMinutes: null, status: 'unavailable' });
      });
    return () => { cancelled = true; };
  }, [destination, location]);

  useEffect(() => {
    if (!assignment) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismissedAssignmentIds.current.add(assignment.backup_request_id);
        setAssignment(null);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [assignment]);

  async function confirmDispatch() {
    if (!assignment || busy || !location) return;
    setBusy(true);
    setError('');
    try {
      await api.patch(`/backup-requests/${assignment.backup_request_id}/respond`);
      setAssignment(null);
      onOpenIncidents();
    } catch (caught: unknown) {
      const apiError = caught as ApiError;
      if (apiError.response?.status === 401) return onAuthError();
      setError(apiError.response?.data?.message || 'Unable to confirm this rescue dispatch.');
    } finally {
      setBusy(false);
    }
  }

  function standby() {
    if (!assignment) return;
    dismissedAssignmentIds.current.add(assignment.backup_request_id);
    setAssignment(null);
  }

  if (!assignment || !destination) return null;
  const responderLabel = responderRole === 'barangay_rescuer' ? 'Barangay Rescuer' : 'CDRRMD Rescuer';

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto bg-slate-950/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="rescuer-assignment-title">
      <section className="w-full max-w-6xl rounded-3xl border-t-4 border-[#1f567d] bg-white p-5 shadow-2xl sm:p-7">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,1fr)]">
          <div className="min-w-0">
            <p className="text-sm font-black uppercase tracking-wider text-red-700">New {responderLabel} Assignment</p>
            <h2 id="rescuer-assignment-title" className="mt-4 text-2xl font-black uppercase text-[#173750] sm:text-3xl">{assignment.reporter_name || 'Resident Rescue Request'}</h2>
            <p className="mt-4 text-lg font-bold text-[#173750]">{assignment.incident_type.replace(/_/g, ' ')}</p>
            <dl className="mt-5 grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
              <dt className="font-bold uppercase text-slate-500">Contact</dt><dd className="font-bold text-[#173750]">{assignment.reporter_contact || 'Not provided'}</dd>
              <dt className="font-bold uppercase text-slate-500">People</dt><dd className="font-bold text-[#173750]">{assignment.estimated_people ?? assignment.evacuees_reserved ?? 1}</dd>
              <dt className="font-bold uppercase text-slate-500">Location</dt><dd className="font-bold text-[#173750]">{assignment.location}</dd>
              <dt className="font-bold uppercase text-slate-500">Coordinates</dt><dd className="font-bold text-[#173750]">{destination.latitude.toFixed(6)}, {destination.longitude.toFixed(6)}</dd>
              <dt className="font-bold uppercase text-slate-500">Barangay</dt><dd className="font-bold text-[#173750]">{assignment.assigned_barangay}</dd>
              <dt className="font-bold uppercase text-slate-500">Evacuation</dt><dd className="font-bold text-[#173750]">{assignment.evacuation_area_name || 'Nearest available center'}</dd>
              <dt className="font-bold uppercase text-slate-500">Shortest route</dt><dd className="font-bold text-[#173750]">{route.distanceKm != null && route.etaMinutes != null ? `${route.distanceKm.toFixed(2)} km · about ${route.etaMinutes} min` : route.status === 'unavailable' ? 'Road route unavailable' : 'Calculating…'}</dd>
            </dl>
            <p className="mt-5 font-mono text-sm font-bold text-slate-400">{assignment.report_code}</p>
          </div>

          <AssignmentRouteMap origin={location} destination={destination} route={route.coordinates} status={route.status} />
        </div>

        {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
        <div className="mt-6 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2">
          <button type="button" disabled={busy || !location || route.status === 'loading'} onClick={() => void confirmDispatch()} className="rounded-xl bg-emerald-700 px-5 py-3 text-lg font-black text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Confirming…' : !location ? 'Waiting for GPS…' : 'Confirm Dispatch'}</button>
          <button type="button" disabled={busy} onClick={standby} className="rounded-xl border border-slate-300 bg-slate-100 px-5 py-3 text-lg font-black text-slate-600 hover:bg-slate-200 disabled:opacity-50">Standby Request</button>
        </div>
      </section>
    </div>
  );
}
