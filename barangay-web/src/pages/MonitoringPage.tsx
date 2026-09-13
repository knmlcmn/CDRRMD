import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/apiClient';
import BarangayShell from '../components/BarangayShell';
import { d } from '../barangayDesign';
import type { IncidentReport, EvacuationAreaItem } from '../types';
import { buildCalambaMapHtml } from '../utils/calambaMapHtml';

type Props = {
  barangayName: string;
  onLogout: () => void;
  onOpenFloodMonitoring: () => void;
  onOpenAccount: () => void;
  onAuthError: () => void;
};

type Coordinate = { latitude: number; longitude: number };

type ActionMode = 'accept' | 'decline' | null;

type MonitoringLayerVisibility = {
  boundary: boolean;
  floodHazard: boolean;
  evacuationAreas: boolean;
  incidentMarkers: boolean;
  responderRoute: boolean;
  weatherOverlay: boolean;
  windOverlay: boolean;
};

type RainRankingItem = {
  barangayName: string;
  rainIntensityMmPerHour: number;
  rainLevel: 'Light' | 'Moderate' | 'Heavy' | 'Severe';
};

type DestinationType = 'resident' | 'evacuation_center';

type RouteDestination = {
  location: Coordinate;
  type: DestinationType;
  label: string;
};

const ACTIVE_RESCUE_STATUSES = new Set(['pending', 'accepted', 'in_progress']);
// How long a just-rescued case keeps showing its "route to evacuation center"
// on the active board before it falls back to the Resolved history tab only.
const RESOLVED_VISIBILITY_WINDOW_MS = 3 * 60 * 60 * 1000;
// How often we re-check the rescuer's live device location (ms).
const RESCUER_LOCATION_POLL_MS = 15000;
// Ignore ordinary GPS jitter so the embedded map is not rebuilt while the
// rescuer device is stationary (roughly a 20-metre tolerance).
const RESCUER_LOCATION_JITTER_DEGREES = 0.0002;

function sameData(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRescueReport(report?: IncidentReport | null) {
  return String(report?.report_type || '').toLowerCase() === 'rescue';
}

// "Rescue Requested" phase: the barangay still needs to reach the resident.
function isRescueAwaitingPickup(report?: IncidentReport | null) {
  if (!isRescueReport(report)) return false;
  const status = String(report?.status || '').toLowerCase();
  return status === 'pending' || status === 'accepted';
}

function isRecentlyResolvedRescue(report: IncidentReport) {
  if (!report.resolved_at) return true;
  const resolvedAt = new Date(report.resolved_at).getTime();
  if (!Number.isFinite(resolvedAt)) return true;
  return Date.now() - resolvedAt < RESOLVED_VISIBILITY_WINDOW_MS;
}

// "Rescued" phase: the resident has been confirmed rescued and the barangay
// is now routing them to their designated evacuation center.
function isRescueEnRouteToEvac(report?: IncidentReport | null) {
  if (!isRescueReport(report)) return false;
  return String(report?.status || '').toLowerCase() === 'resolved';
}

function formatRescueAwareStatus(report?: IncidentReport | null) {
  if (isRescueReport(report)) {
    const status = String(report?.status || 'pending').toLowerCase();
    if (status === 'pending' || status === 'accepted') return 'Rescue Requested';
    if (status === 'resolved') return 'Rescued';
    if (status === 'declined') return 'Declined';
  }
  return formatStatus(report?.status);
}

function extractCoordinate(value?: string | null, lat?: number | null, lon?: number | null): Coordinate | null {
  if (lat !== null && lat !== undefined && lon !== null && lon !== undefined && Number.isFinite(lat) && Number.isFinite(lon)) {
    return { latitude: Number(lat), longitude: Number(lon) };
  }
  const text = String(value || '');
  const match = text.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function distanceSquared(a: Coordinate, b: Coordinate) {
  const dLat = a.latitude - b.latitude;
  const dLon = a.longitude - b.longitude;
  return dLat * dLat + dLon * dLon;
}

async function fetchRoadRoute(from: Coordinate, to: Coordinate) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/${from.longitude},${from.latitude};` +
    `${to.longitude},${to.latitude}?overview=full&geometries=geojson&alternatives=false&steps=false`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OSRM ${response.status}`);
  }

  const data = (await response.json()) as {
    routes?: Array<{ distance?: number; duration?: number; geometry?: { coordinates?: number[][] } }>;
  };

  const route = data.routes?.[0];
  if (!route?.distance || !route?.duration || !route.geometry?.coordinates?.length) {
    throw new Error('No route');
  }

  return {
    distanceKm: route.distance / 1000,
    etaMinutes: Math.max(1, Math.round(route.duration / 60)),
    coordinates: route.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })),
  };
}

function formatStatus(status?: string | null) {
  return String(status || 'pending')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatType(value?: string | null) {
  return String(value || '-')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function MonitoringPage({ barangayName, onLogout, onOpenFloodMonitoring, onOpenAccount, onAuthError }: Props) {
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [evacuationAreas, setEvacuationAreas] = useState<EvacuationAreaItem[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<Coordinate[]>([]);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeEtaMinutes, setRouteEtaMinutes] = useState<number | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | 'pending' | 'accepted' | 'in_progress' | 'resolved' | 'declined'>('active');
  const [notes, setNotes] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [declineExplanation, setDeclineExplanation] = useState('');
  const [showRainRanking, setShowRainRanking] = useState(false);
  const [topRainBarangays, setTopRainBarangays] = useState<RainRankingItem[]>([]);
  const [rainUpdatedAt, setRainUpdatedAt] = useState<string | null>(null);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const mapWrapRef = useRef<HTMLElement | null>(null);
  const [rescuerLocation, setRescuerLocation] = useState<Coordinate | null>(null);
  const [rescuerLocationError, setRescuerLocationError] = useState<string | null>(null);
  const [layerVisibility] = useState<MonitoringLayerVisibility>({
    boundary: true,
    floodHazard: false,
    evacuationAreas: true,
    incidentMarkers: true,
    responderRoute: true,
    weatherOverlay: true,
    windOverlay: false,
  });

  async function loadData(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const [reportsRes, areasRes] = await Promise.allSettled([
        api.get('/barangay/reports/mine'),
        api.get('/content/evacuation-areas'),
      ]);

      const reportsFailed = reportsRes.status === 'rejected';
      const areasFailed = areasRes.status === 'rejected';

      if (reportsRes.status === 'fulfilled') {
        const nextReports = Array.isArray(reportsRes.value.data) ? reportsRes.value.data : [];
        setReports((current) => sameData(current, nextReports) ? current : nextReports);
      } else if (reportsRes.reason?.response?.status === 401) {
        onAuthError();
        return;
      } else {
        setReports([]);
      }

      if (areasRes.status === 'fulfilled') {
        const nextAreas = Array.isArray(areasRes.value.data) ? areasRes.value.data : [];
        const ownAreas = nextAreas.filter((a: EvacuationAreaItem) =>
          String(a.barangay || '').toLowerCase() === barangayName.toLowerCase()
        );
        setEvacuationAreas((current) => sameData(current, ownAreas) ? current : ownAreas);
      } else {
        setEvacuationAreas([]);
      }

      if (reportsFailed && areasFailed) {
        setError('Failed to load monitoring data.');
      } else {
        setError(null);
      }
    } catch (err: any) {
      if (err?.response?.status === 401) { onAuthError(); return; }
      setError(err?.response?.data?.message || 'Failed to load monitoring data.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  async function loadRainRanking() {
    try {
      const res = await api.get('/flood-risk/calamba/rain-impact').catch(() => ({ data: null }));
      const payload = res?.data as {
        updatedAt?: string;
        barangayImpacts?: Array<{ barangayName?: string; rainIntensityMmPerHour?: number; rainLevel?: string }>;
      } | null;
      const impacts = Array.isArray(payload?.barangayImpacts) ? payload.barangayImpacts : [];
      const ranked = impacts
        .filter((item) => {
          const name = String(item?.barangayName || '').toLowerCase();
          return name === barangayName.toLowerCase();
        })
        .map((item) => {
          const rain = Number(item?.rainIntensityMmPerHour || 0);
          const lvl = String(item?.rainLevel || 'Light');
          const level = (['Severe', 'Heavy', 'Moderate'].includes(lvl) ? lvl : 'Light') as RainRankingItem['rainLevel'];
          return { barangayName: String(item?.barangayName || barangayName), rainIntensityMmPerHour: rain, rainLevel: level };
        });
      setTopRainBarangays((current) => sameData(current, ranked) ? current : ranked);
      const nextUpdatedAt = payload?.updatedAt || null;
      setRainUpdatedAt((current) => current === nextUpdatedAt ? current : nextUpdatedAt);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    loadData(true).catch(() => {});
    loadRainRanking().catch(() => {});
    const rt = setInterval(() => loadData(false).catch(() => {}), 2500);
    const rr = setInterval(() => loadRainRanking().catch(() => {}), 10000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadData(false).catch(() => {});
        loadRainRanking().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(rt);
      clearInterval(rr);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [barangayName]);

  useEffect(() => {
    const onFsChange = () => { if (!document.fullscreenElement) setIsMapFullscreen(false); };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Track the rescuer's own live position on this barangay web device, so the
  // route can always be drawn from "where the rescuer is now" to the current
  // destination (resident, then evacuation center).
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setRescuerLocationError('Geolocation is not supported on this device.');
      return;
    }

    let cancelled = false;

    function pollLocation() {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (cancelled) return;
          const nextLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude };
          setRescuerLocation((current) => {
            if (!current) return nextLocation;
            const movement = Math.sqrt(distanceSquared(current, nextLocation));
            return movement < RESCUER_LOCATION_JITTER_DEGREES ? current : nextLocation;
          });
          setRescuerLocationError(null);
        },
        (geoErr) => {
          if (cancelled) return;
          setRescuerLocationError(geoErr?.message || 'Unable to determine current location.');
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 8000 },
      );
    }

    pollLocation();
    const locationTimer = setInterval(pollLocation, RESCUER_LOCATION_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(locationTimer);
    };
  }, []);

  function enterFullscreen() {
    const el = mapWrapRef.current;
    if (el?.requestFullscreen) el.requestFullscreen().then(() => setIsMapFullscreen(true)).catch(() => {});
  }

  function exitFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().then(() => setIsMapFullscreen(false)).catch(() => {});
  }

  const activeReports = useMemo(
    () => reports.filter((r) => {
      const status = String(r.status).toLowerCase();
      if (ACTIVE_RESCUE_STATUSES.has(status)) return true;
      // Keep a just-rescued case visible on the active board for a while so
      // the barangay keeps seeing its route to the evacuation center.
      return isRescueEnRouteToEvac(r) && isRecentlyResolvedRescue(r);
    }),
    [reports],
  );

  const filteredReports = useMemo(() => {
    if (statusFilter === 'active') return activeReports;
    return reports.filter((r) => String(r.status).toLowerCase() === statusFilter);
  }, [reports, activeReports, statusFilter]);

  const selectedReport = useMemo(
    () => filteredReports.find((r) => r.id === selectedReportId) ?? filteredReports[0] ?? null,
    [filteredReports, selectedReportId],
  );

  // The evacuation center this resident is assigned to (automatically
  // resolved by their own barangay/jurisdiction — see backend).
  const assignedEvacuationArea = useMemo(() => {
    if (!selectedReport || !isRescueReport(selectedReport)) return null;
    if (evacuationAreas.length === 0) return null;
    const explicitId = Number(selectedReport.evacuation_area_id);
    if (Number.isFinite(explicitId)) {
      const byId = evacuationAreas.find((a) => a.id === explicitId && a.is_active);
      if (byId) return byId;
    }
    const explicitName = String(selectedReport.evacuation_area_name || '').trim().toLowerCase();
    if (explicitName) {
      const byName = evacuationAreas.find((a) => a.name.trim().toLowerCase() === explicitName && a.is_active);
      if (byName) return byName;
    }
    const incident = extractCoordinate(selectedReport.location, selectedReport.latitude, selectedReport.longitude);
    if (!incident) return null;
    return evacuationAreas
      .filter((a) => a.is_active)
      .map((a) => ({ a, dist: distanceSquared(incident, { latitude: a.latitude, longitude: a.longitude }) }))
      .sort((x, y) => x.dist - y.dist)[0]?.a ?? null;
  }, [evacuationAreas, selectedReport]);

  // Fallback "home base" for the rescuer's route origin if live device
  // geolocation is unavailable/denied — the barangay's own evacuation area.
  const barangayBaseLocation = useMemo<Coordinate | null>(() => {
    const active = evacuationAreas.find((a) => a.is_active);
    return active ? { latitude: active.latitude, longitude: active.longitude } : null;
  }, [evacuationAreas]);

  const rescuerOrigin = rescuerLocation || barangayBaseLocation;

  // The single source of truth for "where is the rescuer heading right now":
  // the resident, until confirmed rescued — then the evacuation center.
  const routeDestination = useMemo<RouteDestination | null>(() => {
    if (!selectedReport || !isRescueReport(selectedReport)) return null;

    if (isRescueAwaitingPickup(selectedReport)) {
      const residentLocation = extractCoordinate(selectedReport.location, selectedReport.latitude, selectedReport.longitude);
      if (!residentLocation) return null;
      const code = selectedReport.report_code || `RPT-${String(selectedReport.id).padStart(6, '0')}`;
      return { location: residentLocation, type: 'resident', label: `Resident needs rescue — ${code}` };
    }

    if (isRescueEnRouteToEvac(selectedReport)) {
      if (!assignedEvacuationArea) return null;
      return {
        location: { latitude: assignedEvacuationArea.latitude, longitude: assignedEvacuationArea.longitude },
        type: 'evacuation_center',
        label: `Evacuation Center — ${assignedEvacuationArea.name}`,
      };
    }

    return null;
  }, [assignedEvacuationArea, selectedReport]);

  useEffect(() => {
    if (!routeDestination || !rescuerOrigin) {
      setRouteCoordinates([]);
      setRouteDistanceKm(null);
      setRouteEtaMinutes(null);
      return;
    }

    let cancelled = false;
    fetchRoadRoute(rescuerOrigin, routeDestination.location)
      .then((route) => {
        if (cancelled) return;
        setRouteCoordinates(route.coordinates);
        setRouteDistanceKm(route.distanceKm);
        setRouteEtaMinutes(route.etaMinutes);
      })
      .catch(() => {
        if (cancelled) return;
        setRouteCoordinates([rescuerOrigin, routeDestination.location]);
        setRouteDistanceKm(null);
        setRouteEtaMinutes(null);
      });
    return () => {
      cancelled = true;
    };
  }, [
    rescuerOrigin?.latitude,
    rescuerOrigin?.longitude,
    routeDestination?.type,
    routeDestination?.location.latitude,
    routeDestination?.location.longitude,
  ]);

  const mapHtml = useMemo(
    () => buildCalambaMapHtml(
      evacuationAreas,
      rescuerOrigin,
      routeCoordinates,
      routeDestination?.location ?? null,
      selectedReport && routeDestination
        ? (selectedReport.report_code || `RPT-${String(selectedReport.id).padStart(6, '0')}`)
        : null,
      activeReports
        .map((r) => ({
          reportCode: r.report_code || `RPT-${String(r.id).padStart(6, '0')}`,
          latitude: Number(r.latitude),
          longitude: Number(r.longitude),
          status: String(r.status || 'pending'),
          reportType: String(r.report_type || 'incident'),
        }))
        .filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude)),
      `${String(api.defaults.baseURL || 'http://localhost:4000/api').replace(/\/$/, '')}/flood-risk/calamba/barangays`,
      `${String(api.defaults.baseURL || 'http://localhost:4000/api').replace(/\/$/, '')}/flood-risk/calamba/raster`,
      `${String(api.defaults.baseURL || 'http://localhost:4000/api').replace(/\/$/, '')}/flood-risk/calamba/rain-impact`,
      `${String(api.defaults.baseURL || 'http://localhost:4000/api').replace(/\/$/, '')}/weather/wind-field`,
      layerVisibility,
      barangayName,
      { origin: routeDestination?.label || 'Destination', destination: 'Rescuer — current location' },
    ),
    [activeReports, evacuationAreas, layerVisibility, rescuerOrigin, routeCoordinates, routeDestination, selectedReport, barangayName],
  );

  // layerRows handled inside the Leaflet map Layers button (top-right)

  const stats = useMemo(() => {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return {
      totalToday: reports.filter((r) => new Date(r.created_at).getTime() >= dayStart).length,
      pending: reports.filter((r) => r.status === 'pending').length,
      inProgress: reports.filter((r) => r.status === 'in_progress').length,
      resolved: reports.filter((r) => r.status === 'resolved').length,
    };
  }, [reports]);

  async function updateStatus(nextStatus: 'accepted' | 'declined') {
    if (!selectedReport || busy) {
      return;
    }

    if (nextStatus === 'accepted' && !notes.trim()) {
      setError('Notes are required before accepting a report.');
      return;
    }

    if (nextStatus === 'declined' && (!declineReason.trim() || !declineExplanation.trim())) {
      setError('Decline reason and explanation are required.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await api.patch(`/barangay/reports/${selectedReport.id}/status`, {
        status: nextStatus,
        notes: nextStatus === 'accepted' ? notes : '',
        declineReason,
        declineExplanation,
      });

      setActionMode(null);
      setNotes('');
      setDeclineReason('');
      setDeclineExplanation('');
      await loadData(false);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        onAuthError();
        return;
      }
      setError(err?.response?.data?.message || 'Failed to update report status.');
    } finally {
      setBusy(false);
    }
  }

  // "Confirm Resident Rescued" — flips status from Rescue Requested to
  // Rescued. The backend then auto-assigns the resident's jurisdiction
  // evacuation center, which flips the map/route destination automatically.
  async function confirmResidentRescued() {
    if (!selectedReport || busy) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await api.patch(`/barangay/reports/${selectedReport.id}/status`, {
        status: 'resolved',
      });
      await loadData(false);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        onAuthError();
        return;
      }
      setError(err?.response?.data?.message || 'Failed to confirm the rescue.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <BarangayShell
      activeView="monitoring"
      title="Incident Monitoring"
      subtitle={`Showing incidents within Barangay ${barangayName}`}
      noMainScroll
      barangayName={barangayName}
      onLogout={onLogout}
      onOpenMonitoring={() => {}}
      onOpenFloodMonitoring={onOpenFloodMonitoring}
      onOpenAccount={onOpenAccount}
    >
      <div className={d.monitoring.root}>
        {error ? <div className={d.page.error}>{error}</div> : null}

        {/* Stats */}
        <section className={d.monitoring.statsGrid}>
          <article className={[d.monitoring.statCardBase, d.monitoring.statReports].join(' ')}><p className={d.monitoring.statValue}>{stats.totalToday}</p><p className={d.monitoring.statLabel}>Reports Today</p></article>
          <article className={[d.monitoring.statCardBase, d.monitoring.statPending].join(' ')}><p className={d.monitoring.statValue}>{stats.pending}</p><p className={d.monitoring.statLabel}>Pending</p></article>
          <article className={[d.monitoring.statCardBase, d.monitoring.statInProgress].join(' ')}><p className={d.monitoring.statValue}>{stats.inProgress}</p><p className={d.monitoring.statLabel}>In Progress</p></article>
          <article className={[d.monitoring.statCardBase, d.monitoring.statResolved].join(' ')}><p className={d.monitoring.statValue}>{stats.resolved}</p><p className={d.monitoring.statLabel}>Resolved</p></article>
        </section>

        {/* Map + selected report */}
        <section className={d.monitoring.mainGrid}>
          <article
            ref={mapWrapRef}
            className={d.monitoring.mapCard}
            style={isMapFullscreen ? { position: 'fixed', inset: 0, zIndex: 9999, borderRadius: 0, minHeight: '100dvh', display: 'flex', flexDirection: 'column' } : { position: 'relative' }}
          >
            <iframe title="Barangay monitoring map" srcDoc={mapHtml} className={d.monitoring.mapFrame} />
            {!isMapFullscreen ? (
              <button
                onClick={enterFullscreen}
                title="Enter fullscreen"
                style={{ position: 'absolute', bottom: 10, right: 10, zIndex: 1000, background: 'rgba(15,23,42,0.82)', border: '1px solid rgba(148,163,184,0.3)', borderRadius: 8, color: '#fff', cursor: 'pointer', padding: '6px 7px', display: 'flex', alignItems: 'center', backdropFilter: 'blur(4px)' }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                  <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                </svg>
              </button>
            ) : (
              <button
                onClick={exitFullscreen}
                title="Exit fullscreen"
                style={{ position: 'absolute', bottom: 16, right: 16, zIndex: 10000, background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(148,163,184,0.4)', borderRadius: 8, color: '#fff', cursor: 'pointer', padding: '7px 8px', display: 'flex', alignItems: 'center', backdropFilter: 'blur(4px)' }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
                  <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
                </svg>
              </button>
            )}
          </article>

          <div className={d.monitoring.mapSideColumn}>
            <section className={d.monitoring.rainRankCard}>
              <div className={d.monitoring.rainRankHead}>
                <h3 className={d.monitoring.rainRankTitle}>Rainfall — Brgy. {barangayName}</h3>
                <button type="button" onClick={() => setShowRainRanking((p) => !p)} className={d.btn.secondaryXs}>
                  {showRainRanking ? 'Hide' : 'Show'}
                </button>
              </div>
              <p className={d.monitoring.rainRankUpdated} style={{ marginTop: 6 }}>
                Updated: {rainUpdatedAt ? new Date(rainUpdatedAt).toLocaleTimeString() : '—'}
              </p>
              {showRainRanking ? (
                <div className={d.monitoring.rainRankPopover}>
                  {topRainBarangays.length === 0 ? (
                    <p className={d.monitoring.rainRankEmpty}>No active rainfall data for this barangay.</p>
                  ) : (
                    <div className={d.monitoring.rainRankSideList}>
                      {topRainBarangays.map((item, i) => (
                        <article key={i} className={d.monitoring.rainRankRow}>
                          <p className={d.monitoring.rainRankName}>{item.barangayName}</p>
                          <p className={d.monitoring.rainRankMeta}>Intensity: {item.rainIntensityMmPerHour.toFixed(2)} mm/hr</p>
                          <p className={d.monitoring.rainRankMeta}>Level: {item.rainLevel}</p>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </section>

          {selectedReport ? (
            <article className={d.monitoring.selectedCard} style={{ overflowY: 'auto', minWidth: 0 }}>
              <h3 className={d.monitoring.selectedTitle}>Incident Detail</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.8rem' }}>
                <p><strong>ID:</strong> {selectedReport.report_code || `RPT-${String(selectedReport.id).padStart(6, '0')}`}</p>
                <p><strong>Type:</strong> {formatType(selectedReport.report_type)}</p>
                <p><strong>Incident:</strong> {formatType(selectedReport.incident_type)}</p>
                <p><strong>Status:</strong> {formatRescueAwareStatus(selectedReport)}</p>
                <p><strong>Location:</strong> {selectedReport.location}</p>
                <p><strong>Reporter:</strong> {[selectedReport.first_name, selectedReport.last_name].filter(Boolean).join(' ') || selectedReport.email || 'N/A'}</p>
                <p><strong>Contact:</strong> {selectedReport.contact_number || 'N/A'}</p>
                <p><strong>Reported:</strong> {new Date(selectedReport.created_at).toLocaleString()}</p>
                {isRescueReport(selectedReport) ? (
                  <>
                    <div
                      style={{
                        marginTop: 4,
                        padding: '8px 10px',
                        borderRadius: 8,
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        background: isRescueAwaitingPickup(selectedReport) ? '#fef2f2' : '#f0fdf4',
                        border: `1px solid ${isRescueAwaitingPickup(selectedReport) ? '#fecaca' : '#bbf7d0'}`,
                        color: isRescueAwaitingPickup(selectedReport) ? '#b91c1c' : '#15803d',
                      }}
                    >
                      {isRescueAwaitingPickup(selectedReport)
                        ? '🚨 Route to Resident — go pick up the resident'
                        : isRescueEnRouteToEvac(selectedReport)
                          ? '✅ Resident Rescued — routing to evacuation center'
                          : 'Rescue case'}
                      <div style={{ marginTop: 4, fontWeight: 600 }}>
                        Current destination: {routeDestination?.label || 'Calculating…'}
                      </div>
                    </div>
                    <p><strong>Evacuation Area:</strong> {selectedReport.evacuation_area_name || assignedEvacuationArea?.name || 'N/A'}</p>
                    <p><strong>Route Distance:</strong> {routeDistanceKm ? `${routeDistanceKm.toFixed(2)} km` : 'Calculating...'}</p>
                    <p><strong>Route ETA:</strong> {routeEtaMinutes ? `${routeEtaMinutes} mins` : 'Calculating...'}</p>
                    <p style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      {rescuerLocation
                        ? 'Route origin: your device\u2019s live location.'
                        : `Route origin: barangay base location (live GPS unavailable${rescuerLocationError ? `: ${rescuerLocationError}` : ''}).`}
                    </p>
                  </>
                ) : null}
                {selectedReport.water_level ? <p><strong>Water Level:</strong> {selectedReport.water_level}</p> : null}
                {selectedReport.are_people_trapped ? <p><strong>People Trapped:</strong> {selectedReport.estimated_people ?? 'Unknown'}</p> : null}
                {selectedReport.assigned_team ? <p><strong>Assigned Team:</strong> {selectedReport.assigned_team}</p> : null}
                {selectedReport.admin_notes ? <p><strong>Admin Notes:</strong> {selectedReport.admin_notes}</p> : null}
                {selectedReport.notes ? <p><strong>Reporter Notes:</strong> {selectedReport.notes}</p> : null}
                {selectedReport.image_base64 ? (
                  <button
                    onClick={() => setPreviewImage(selectedReport.image_base64 || null)}
                    className={d.btn.secondaryXs}
                    style={{ alignSelf: 'flex-start', marginTop: 4 }}
                  >
                    View Proof Photo
                  </button>
                ) : null}
              </div>
              <div style={{ marginTop: 12, padding: '8px 10px', background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd', fontSize: '0.75rem', color: '#0369a1' }}>
                <strong>ℹ️ Barangay review view.</strong> Accept or decline pending reports from this barangay.
              </div>
            </article>
          ) : null}
          </div>
        </section>

        {/* Incidents table + validation */}
        <section className={d.monitoring.lowerGrid}>
          <article className={d.monitoring.incidentsCard}>
            <div className={d.monitoring.incidentsHead}>
              <h3 className={d.monitoring.incidentsTitle}>
                Incidents in Brgy. {barangayName}
                <span style={{ marginLeft: 8, fontSize: '0.78rem', fontWeight: 600, color: '#64748b' }}>
                  ({reports.length} total)
                </span>
              </h3>
              <div className={d.monitoring.filterWrap}>
                {(['active', 'pending', 'accepted', 'in_progress', 'resolved', 'declined'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={[d.monitoring.filterBase, statusFilter === status ? d.monitoring.filterActive : d.monitoring.filterIdle].join(' ')}
                  >
                    {formatStatus(status)}
                  </button>
                ))}
              </div>
            </div>
            <div className={d.monitoring.incidentsTableWrap}>
              <table className={d.monitoring.incidentReportsTable}>
                <thead>
                  <tr>
                    <th>Incident ID</th>
                    <th>Type</th>
                    <th>Incident</th>
                    <th>Location</th>
                    <th>Status</th>
                    <th>Reported</th>
                    <th>Proof</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} className={d.table.empty}>Loading incidents…</td></tr>
                  ) : filteredReports.length === 0 ? (
                    <tr><td colSpan={7} className={d.table.empty}>No incidents in this barangay for the selected filter.</td></tr>
                  ) : filteredReports.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedReportId(item.id)}
                      className={[d.monitoring.rowBase, selectedReport?.id === item.id ? d.monitoring.rowSelected : ''].join(' ')}
                    >
                      <td className="font-mono text-xs">{item.report_code || `RPT-${String(item.id).padStart(6, '0')}`}</td>
                      <td>{formatType(item.report_type)}</td>
                      <td>{formatType(item.incident_type)}</td>
                      <td className={d.monitoring.rowLocation}>{item.location}</td>
                      <td><span className={d.monitoring.statusChip}>{formatRescueAwareStatus(item)}</span></td>
                      <td style={{ fontSize: '0.75rem', color: '#64748b' }}>{new Date(item.created_at).toLocaleDateString()}</td>
                      <td>
                        {item.image_base64 ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); setPreviewImage(item.image_base64 || null); }}
                            className={d.btn.secondaryXs}
                          >View</button>
                        ) : <span className={d.monitoring.muted}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className={d.monitoring.validationCard}>
            <h3 className={d.monitoring.validationTitle}>Report Validation</h3>
            <div className={d.monitoring.validationScrollWrap}>
              {!selectedReport ? (
                <p className={d.monitoring.validationEmpty}>Select a report to review.</p>
              ) : (
                <div className={d.monitoring.validationStack}>
                <p className={d.monitoring.validationCurrent}>Current status: {formatRescueAwareStatus(selectedReport)}</p>
                <p className={d.monitoring.validationCurrent}>Report type: {formatType(selectedReport.report_type)}</p>
                {isRescueReport(selectedReport) && (selectedReport.evacuation_area_name || assignedEvacuationArea?.name) ? (
                  <p className={d.monitoring.assignNote}>
                    {isRescueEnRouteToEvac(selectedReport) ? 'Evacuation center (current destination): ' : 'Designated evacuation center: '}
                    {selectedReport.evacuation_area_name || assignedEvacuationArea?.name}
                  </p>
                ) : null}
                {selectedReport.status === 'pending' ? (
                  <div className={d.monitoring.actionRow}>
                    <button onClick={() => setActionMode('accept')} className={d.btn.acceptDisabled} disabled={busy}>Accept</button>
                    <button onClick={() => setActionMode('decline')} className={d.btn.declineDisabled} disabled={busy}>Decline</button>
                  </div>
                ) : null}
                {isRescueReport(selectedReport) && selectedReport.status === 'accepted' ? (
                  <div className={d.monitoring.actionBox}>
                    <p style={{ fontSize: '0.75rem', color: '#334155', margin: 0 }}>
                      Once you've reached and picked up the resident, confirm below to automatically switch the route
                      to their designated evacuation center.
                    </p>
                    <div className={d.monitoring.actionRow}>
                      <button onClick={() => confirmResidentRescued()} className={d.btn.acceptDisabled} disabled={busy}>
                        Confirm Resident Rescued
                      </button>
                    </div>
                  </div>
                ) : null}
                {actionMode === 'accept' ? (
                  <div className={d.monitoring.actionBox}>
                    <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add validation notes" className={d.form.textareaSm} />
                    <div className={d.monitoring.actionRow}>
                      <button onClick={() => updateStatus('accepted')} className={d.btn.acceptDisabled} disabled={busy}>Confirm Accept</button>
                      <button onClick={() => setActionMode(null)} className={d.btn.secondaryXs} disabled={busy}>Cancel</button>
                    </div>
                  </div>
                ) : null}
                {actionMode === 'decline' ? (
                  <div className={d.monitoring.actionBox}>
                    <select value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} className={d.form.selectSm}>
                      <option value="">Select reason</option>
                      <option value="invalid report">Invalid report</option>
                      <option value="duplicate">Duplicate</option>
                      <option value="outside jurisdiction">Outside jurisdiction</option>
                      <option value="false alarm">False alarm</option>
                      <option value="other">Other</option>
                    </select>
                    <textarea value={declineExplanation} onChange={(event) => setDeclineExplanation(event.target.value)} placeholder="Explain why this report is declined" className={d.form.textareaSm} />
                    <div className={d.monitoring.actionRow}>
                      <button onClick={() => updateStatus('declined')} className={d.btn.declineDisabled} disabled={busy}>Confirm Decline</button>
                      <button onClick={() => setActionMode(null)} className={d.btn.secondaryXs} disabled={busy}>Cancel</button>
                    </div>
                  </div>
                ) : null}
                </div>
              )}
            </div>
          </article>
        </section>

        {/* Image preview modal */}
        {previewImage ? (
          <div className={d.modal.overlay}>
            <div className={d.modal.card}>
              <div className={d.modal.header}>
                <h4 className={d.modal.title}>Incident Proof Photo</h4>
                <button onClick={() => setPreviewImage(null)} className={d.modal.close}>Close</button>
              </div>
              <img src={previewImage} alt="Incident proof" className={d.modal.image} />
            </div>
          </div>
        ) : null}
      </div>
    </BarangayShell>
  );
}
