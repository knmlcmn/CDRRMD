import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../services/apiClient';
import { fetchRoadRoute } from '../../services/roadRouting';
import BackupModal from '../components/BackupModal';
import BackupRequest, { type BackupRequestState } from '../components/BackupRequest';
import BarangayShell from '../components/BarangayShell';
import IncidentHistoryModal from '../../components/IncidentHistoryModal';
import { d } from '../barangayDesign';
import type { IncidentReport, EvacuationAreaItem } from '../../types';
import { buildCalambaMapHtml, type Coordinate } from '../../utils/calambaMapHtml';

type Props = {
  barangayName: string;
  onLogout: () => void;
  onOpenDashboard: () => void;
  onOpenFloodMonitoring: () => void;
  onOpenEvacuationCenter: () => void;
  onOpenAccount: () => void;
  onAuthError: () => void;
  focusReportId?: number | null;
};

type ApiError = { response?: { status?: number; data?: { message?: string } } };

type AssignmentPreview = {
  reportNotes: string | null;
  rescuer: {
    rescuerId: number;
    rescuerName: string;
    rescuerAccountId: string;
    distanceKm: number | null;
    isOnline: boolean;
  } | null;
};

type ActionMode = 'accept' | 'decline' | null;

type MonitoringLayerVisibility = {
  boundary: boolean;
  floodHazard: boolean;
  evacuationAreas: boolean;
  incidentMarkers: boolean;
  responderRoute: boolean;
  weatherOverlay: boolean;
  temperatureOverlay: boolean;
  humidityOverlay: boolean;
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
  return status === 'pending' || status === 'accepted' || status === 'in_progress';
}

function canRequestBackup(report?: IncidentReport | null) {
  if (!isRescueReport(report)) return false;
  const status = String(report?.status || '').toLowerCase();
  return status === 'accepted' || status === 'in_progress';
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
    if (status === 'pending' || status === 'accepted' || status === 'in_progress') return 'Rescue Requested';
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

export default function MonitoringPage({ barangayName, onLogout, onOpenDashboard, onOpenFloodMonitoring, onOpenEvacuationCenter, onOpenAccount, onAuthError, focusReportId = null }: Props) {
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [evacuationAreas, setEvacuationAreas] = useState<EvacuationAreaItem[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [backupRequest, setBackupRequest] = useState<BackupRequestState | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<Coordinate[]>([]);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeEtaMinutes, setRouteEtaMinutes] = useState<number | null>(null);
  const [routeOriginLabel, setRouteOriginLabel] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showIncidentHistory, setShowIncidentHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | 'pending' | 'accepted' | 'in_progress' | 'resolved' | 'declined'>('active');
  const [notes, setNotes] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [declineExplanation, setDeclineExplanation] = useState('');
  const [assignmentPreview, setAssignmentPreview] = useState<AssignmentPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showRainRanking, setShowRainRanking] = useState(false);
  const [topRainBarangays, setTopRainBarangays] = useState<RainRankingItem[]>([]);
  const [rainUpdatedAt, setRainUpdatedAt] = useState<string | null>(null);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const mapWrapRef = useRef<HTMLElement | null>(null);
  const mapFrameRef = useRef<HTMLIFrameElement | null>(null);
  const lastFocusedRescue = useRef('');
  const [mapReady, setMapReady] = useState(false);
  const [layerVisibility] = useState<MonitoringLayerVisibility>({
    boundary: true,
    floodHazard: false,
    evacuationAreas: true,
    incidentMarkers: true,
    responderRoute: true,
    weatherOverlay: true,
    temperatureOverlay: false,
    humidityOverlay: false,
    windOverlay: false,
  });

  useEffect(() => {
    if (focusReportId) setSelectedReportId(focusReportId);
  }, [focusReportId]);

  const loadData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const [reportsRes, areasRes] = await Promise.allSettled([
        api.get('/barangay/reports/mine'),
        api.get('/barangay/evacuation-centers'),
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
        setEvacuationAreas((current) => sameData(current, nextAreas) ? current : nextAreas);
      } else {
        setEvacuationAreas([]);
      }

      if (reportsFailed && areasFailed) {
        setError('Failed to load monitoring data.');
      } else {
        setError(null);
      }
    } catch (err: unknown) {
      const apiError = err as ApiError;
      if (apiError.response?.status === 401) { onAuthError(); return; }
      setError(apiError.response?.data?.message || 'Failed to load monitoring data.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [onAuthError]);

  const loadRainRanking = useCallback(async () => {
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
  }, [barangayName]);

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
  }, [loadData, loadRainRanking]);

  useEffect(() => {
    const onFsChange = () => { if (!document.fullscreenElement) setIsMapFullscreen(false); };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  function enterFullscreen() {
    const el = mapWrapRef.current;
    if (el?.requestFullscreen) el.requestFullscreen().then(() => setIsMapFullscreen(true)).catch(() => {});
  }

  function exitFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().then(() => setIsMapFullscreen(false)).catch(() => {});
  }

  const activeReports = useMemo(
    () => reports.filter((report) => ACTIVE_RESCUE_STATUSES.has(String(report.status).toLowerCase())),
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

  const backupReportId = useMemo(() => {
    return canRequestBackup(selectedReport) ? selectedReport?.id ?? null : null;
  }, [selectedReport]);

  useEffect(() => {
    if (backupRequest?.report_id && reports.some((report) => report.id === backupRequest.report_id)) {
      setSelectedReportId(backupRequest.report_id);
    }
  }, [backupRequest?.report_id, reports]);

  const selectedResidentLocation = useMemo(
    () => extractCoordinate(selectedReport?.location, selectedReport?.latitude, selectedReport?.longitude),
    [selectedReport],
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

  const responderLocation = useMemo<Coordinate | null>(() => {
    if (!selectedReport?.responder_acknowledged_at || selectedReport.rescuer_latitude == null || selectedReport.rescuer_longitude == null) return null;
    const latitude = Number(selectedReport.rescuer_latitude);
    const longitude = Number(selectedReport.rescuer_longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  }, [selectedReport?.rescuer_latitude, selectedReport?.rescuer_longitude, selectedReport?.responder_acknowledged_at]);

  // Route the assigned first responder to the resident, then to the center
  // after pickup while retaining the live responder marker.
  const routeDestination = useMemo<RouteDestination | null>(() => {
    if (!selectedReport?.assigned_rescuer_id || !selectedReport.responder_acknowledged_at || !isRescueReport(selectedReport)) return null;
    if (selectedReport.picked_up_at && assignedEvacuationArea) {
      return {
        location: {
          latitude: Number(assignedEvacuationArea.latitude),
          longitude: Number(assignedEvacuationArea.longitude),
        },
        type: 'evacuation_center',
        label: selectedReport.evacuation_area_name || assignedEvacuationArea?.name || 'Designated evacuation center',
      };
    }
    return selectedResidentLocation
      ? { location: selectedResidentLocation, type: 'resident', label: 'Resident location' }
      : null;
  }, [assignedEvacuationArea, selectedReport, selectedResidentLocation]);

  const activeRouteDestination = routeDestination;

  useEffect(() => {
    let cancelled = false;

    function clearRoute() {
      if (cancelled) return;
      setRouteCoordinates([]);
      setRouteDistanceKm(null);
      setRouteEtaMinutes(null);
      setRouteOriginLabel(null);
    }

    function applyRoute(route: Awaited<ReturnType<typeof fetchRoadRoute>>, originLabel: string) {
      if (cancelled) return;
      setRouteCoordinates(route.coordinates);
      setRouteDistanceKm(route.distanceKm);
      setRouteEtaMinutes(route.etaMinutes);
      setRouteOriginLabel(originLabel);
    }

    function applyFallback(from: Coordinate, to: Coordinate, originLabel: string) {
      if (cancelled) return;
      setRouteCoordinates([from, to]);
      setRouteDistanceKm(null);
      setRouteEtaMinutes(null);
      setRouteOriginLabel(originLabel);
    }

    async function calculateRoute() {
      if (!routeDestination || !responderLocation) {
        clearRoute();
        return;
      }

      if (routeDestination.type === 'resident' && !responderLocation) {
        const candidates = evacuationAreas.filter((area) => area.is_active);
        if (candidates.length === 0) {
          clearRoute();
          return;
        }

        const results = await Promise.allSettled(candidates.map(async (area) => ({
          area,
          route: await fetchRoadRoute(
            { latitude: area.latitude, longitude: area.longitude },
            routeDestination.location,
          ),
        })));
        if (cancelled) return;
        const reachable = results
          .filter((result): result is PromiseFulfilledResult<{
            area: EvacuationAreaItem;
            route: Awaited<ReturnType<typeof fetchRoadRoute>>;
          }> => result.status === 'fulfilled')
          .map((result) => result.value)
          .sort((left, right) => left.route.distanceKm - right.route.distanceKm);
        if (reachable[0]) {
          applyRoute(reachable[0].route, `Evacuation Center — ${reachable[0].area.name}`);
          return;
        }

        const nearestFallback = [...candidates].sort((left, right) =>
          distanceSquared({ latitude: left.latitude, longitude: left.longitude }, routeDestination.location)
          - distanceSquared({ latitude: right.latitude, longitude: right.longitude }, routeDestination.location))[0];
        applyFallback(
          { latitude: nearestFallback.latitude, longitude: nearestFallback.longitude },
          routeDestination.location,
          `Evacuation Center — ${nearestFallback.name}`,
        );
        return;
      }

      if (!responderLocation) {
        clearRoute();
        return;
      }
      try {
        applyRoute(
          await fetchRoadRoute(responderLocation, routeDestination.location),
          selectedReport?.rescuer_name || 'Barangay Rescuer',
        );
      } catch {
        applyFallback(responderLocation, routeDestination.location, selectedReport?.rescuer_name || 'Barangay Rescuer');
      }
    }

    void calculateRoute().catch(() => {
      if (!cancelled) {
        clearRoute();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    routeDestination,
    responderLocation,
    selectedReport?.rescuer_name,
    evacuationAreas,
  ]);

  const incidentPoints = useMemo(() => activeReports
    .map((r) => ({
      reportCode: r.report_code || `RPT-${String(r.id).padStart(6, '0')}`,
      latitude: Number(r.latitude), longitude: Number(r.longitude),
      status: String(r.status || 'pending'), reportType: String(r.report_type || 'incident'),
    }))
    .filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude)), [activeReports]);

  const mapHtml = useMemo(
    () => buildCalambaMapHtml(
      evacuationAreas,
      null,
      [],
      null,
      null,
      incidentPoints,
      `${String(api.defaults.baseURL || 'http://localhost:4000/api').replace(/\/$/, '')}/flood-risk/calamba/barangays`,
      `${String(api.defaults.baseURL || 'http://localhost:4000/api').replace(/\/$/, '')}/flood-risk/calamba/raster`,
      `${String(api.defaults.baseURL || 'http://localhost:4000/api').replace(/\/$/, '')}/flood-risk/calamba/rain-impact`,
      `${String(api.defaults.baseURL || 'http://localhost:4000/api').replace(/\/$/, '')}/weather/wind-field`,
      layerVisibility,
      'Barangay Rescuer location',
      { focusOnIncident: true, allowLiveRouteUpdates: true, responderKind: 'barangay', showForecastTimeline: isMapFullscreen, jurisdictionBarangayName: barangayName },
    ),
    [barangayName, evacuationAreas, incidentPoints, isMapFullscreen, layerVisibility],
  );

  const postMapUpdate = useCallback((recenter = false) => {
    if (!mapReady) return;
    mapFrameRef.current?.contentWindow?.postMessage({
      type: 'rescue-map-update', responderLocation, routeCoordinates,
      incidentLocation: selectedReport?.picked_up_at ? null : (routeDestination?.location || selectedResidentLocation),
      selectedReportCode: selectedReport?.report_code || null,
      incidentPoints, pickedUp: Boolean(selectedReport?.picked_up_at), recenter,
    }, '*');
  }, [incidentPoints, mapReady, responderLocation, routeCoordinates, routeDestination, selectedReport?.picked_up_at, selectedReport?.report_code, selectedResidentLocation]);

  const focusKey = selectedReport?.assigned_rescuer_id ? `${selectedReport.id}:${selectedReport.assigned_rescuer_id}:${Boolean(selectedReport.responder_acknowledged_at)}:${Boolean(selectedReport.picked_up_at)}` : '';
  useEffect(() => {
    if (!mapReady) return;
    const shouldRecenter = Boolean(focusKey) && lastFocusedRescue.current !== focusKey;
    postMapUpdate(shouldRecenter);
    if (shouldRecenter) lastFocusedRescue.current = focusKey;
    if (!focusKey) lastFocusedRescue.current = '';
  }, [focusKey, mapReady, postMapUpdate]);

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
        rescuerId: nextStatus === 'accepted' ? assignmentPreview?.rescuer?.rescuerId : undefined,
        declineReason,
        declineExplanation,
      });

      setActionMode(null);
      setNotes('');
      setDeclineReason('');
      setDeclineExplanation('');
      setAssignmentPreview(null);
      await loadData(false);
    } catch (err: unknown) {
      const apiError = err as ApiError;
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      const message = apiError.response?.data?.message || 'Failed to update report status.';
      if (nextStatus === 'accepted') await openAcceptModal();
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function openAcceptModal() {
    if (!selectedReport) return;
    setActionMode('accept');
    setAssignmentPreview(null);
    setPreviewLoading(true);
    setError(null);
    try {
      const { data } = await api.get<AssignmentPreview>(`/barangay/reports/${selectedReport.id}/rescuer-preview`);
      setAssignmentPreview(data);
    } catch (err: unknown) {
      const apiError = err as ApiError;
      if (apiError.response?.status === 401) return onAuthError();
      setError(apiError.response?.data?.message || 'Unable to find the nearest available Barangay Rescuer.');
    } finally {
      setPreviewLoading(false);
    }
  }

  return (
    <BarangayShell
      activeView="monitoring"
      title="Incident Monitoring"
      actions={(
        <>
          <button type="button" onClick={() => setShowIncidentHistory(true)} className={d.btn.secondary}>Incident History</button>
          <BackupRequest reportId={backupReportId} onRequestChange={setBackupRequest} />
        </>
      )}
      subtitle={`Showing incidents within Barangay ${barangayName}`}
      noMainScroll
      barangayName={barangayName}
      onLogout={onLogout}
      onOpenDashboard={onOpenDashboard}
      onOpenMonitoring={() => {}}
      onOpenFloodMonitoring={onOpenFloodMonitoring}
      onOpenEvacuationCenter={onOpenEvacuationCenter}
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
            <iframe ref={mapFrameRef} onLoad={() => { setMapReady(true); postMapUpdate(Boolean(focusKey)); }} title="Barangay monitoring map" srcDoc={mapHtml} className={d.monitoring.mapFrame} />
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
                <p><strong>Status:</strong> {selectedReport.picked_up_at ? 'Transporting to Evacuation Center' : formatRescueAwareStatus(selectedReport)}</p>
                <p><strong>Location:</strong> {selectedReport.location}</p>
                <p><strong>Reporter:</strong> {[selectedReport.first_name, selectedReport.last_name].filter(Boolean).join(' ') || selectedReport.email || 'N/A'}</p>
                <p><strong>Contact:</strong> {selectedReport.contact_number || 'N/A'}</p>
                <p><strong>Reported:</strong> {new Date(selectedReport.created_at).toLocaleString()}</p>
                {isRescueAwaitingPickup(selectedReport) && selectedReport.assigned_rescuer_id ? (
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
                      🚨 Resident evacuation route
                      <div style={{ marginTop: 4, fontWeight: 600 }}>
                        Current destination: {activeRouteDestination?.label || 'Calculating…'}
                      </div>
                    </div>
                    <p><strong>Barangay Rescuer:</strong> {selectedReport.rescuer_name || 'Assigned responder'}</p>
                    <p><strong>Evacuation Area:</strong> {selectedReport.evacuation_area_name || assignedEvacuationArea?.name || 'N/A'}</p>
                    <p><strong>Route Distance:</strong> {routeDistanceKm ? `${routeDistanceKm.toFixed(2)} km` : 'Calculating...'}</p>
                    <p><strong>Route ETA:</strong> {routeEtaMinutes ? `${routeEtaMinutes} mins` : 'Calculating...'}</p>
                    <p style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      {routeOriginLabel
                        ? `Route: ${routeOriginLabel} to ${routeDestination?.label || 'assigned evacuation center'}.`
                        : 'Calculating the resident-to-evacuation-center route…'}
                    </p>
                  </>
                ) : null}
                {selectedReport.water_level ? <p><strong>Water Level:</strong> {selectedReport.water_level}</p> : null}
                {selectedReport.are_people_trapped ? <p><strong>People Trapped:</strong> {selectedReport.estimated_people ?? 'Unknown'}</p> : null}
                {selectedReport.assigned_team ? <p><strong>Assigned Team:</strong> {selectedReport.assigned_team}</p> : null}
                {backupRequest?.assigned_rescuer_id ? <p><strong>CDRRMD Backup:</strong> {backupRequest.rescuer_name || backupRequest.rescuer_account_id || 'Assigned team'}</p> : null}
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
                <p className={d.monitoring.validationCurrent}>Current status: {selectedReport.picked_up_at ? 'Transporting to Evacuation Center' : formatRescueAwareStatus(selectedReport)}</p>
                <p className={d.monitoring.validationCurrent}>Report type: {formatType(selectedReport.report_type)}</p>
                {isRescueReport(selectedReport) && (selectedReport.evacuation_area_name || assignedEvacuationArea?.name) ? (
                  <p className={d.monitoring.assignNote}>
                    {selectedReport.picked_up_at || isRescueEnRouteToEvac(selectedReport) ? 'Evacuation center (current destination): ' : 'Designated evacuation center: '}
                    {selectedReport.evacuation_area_name || assignedEvacuationArea?.name}
                  </p>
                ) : null}
                {selectedReport.status === 'pending' ? (
                  <div className={d.monitoring.actionRow}>
                    <button
                      type="button"
                      onClick={() => void openAcceptModal()}
                      className={d.btn.acceptDisabled}
                      disabled={busy}
                    >Accept</button>
                    <button
                      type="button"
                      onClick={() => { setError(null); setActionMode('decline'); }}
                      className={d.btn.declineDisabled}
                      disabled={busy}
                    >Decline</button>
                  </div>
                ) : null}
                {isRescueReport(selectedReport)
                  && ['accepted', 'in_progress'].includes(selectedReport.status)
                  && Boolean(selectedReport.assigned_rescuer_id)
                  && !selectedReport.picked_up_at ? (
                  <div className={d.monitoring.actionBox}>
                    <p style={{ fontSize: '0.75rem', color: '#334155', margin: 0 }}>
                      {selectedReport.responder_acknowledged_at ? 'Dispatch acknowledged. GPS proximity will change the report to In Progress when the responder reaches the resident.' : 'The nearest available Barangay Rescuer was assigned automatically and must acknowledge the dispatch before routing begins.'}
                    </p>
                  </div>
                ) : null}
                {backupRequest?.report_id === selectedReport.id
                  && backupRequest.acknowledged_at
                  && !backupRequest.assigned_rescuer_id ? (
                    <p className={d.monitoring.assignNote}>Admin confirmed the backup request. Continue responding while a CDRRMD Rescuer team is assigned.</p>
                  ) : null}
                </div>
              )}
            </div>
          </article>
        </section>

        {actionMode === 'accept' && selectedReport ? (
          <BackupModal
            title="Accept Rescue Request?"
            onClose={() => { setActionMode(null); setAssignmentPreview(null); setError(null); }}
          >
            <p>Confirm that Barangay {barangayName} will respond to this rescue request.</p>
            <p><strong>User notes:</strong> {assignmentPreview?.reportNotes || selectedReport.notes || 'No notes provided.'}</p>
            <p><strong>Assigned Barangay Rescuer:</strong> {previewLoading ? 'Finding nearest available rescuer…' : assignmentPreview?.rescuer ? `${assignmentPreview.rescuer.rescuerName} (${assignmentPreview.rescuer.rescuerAccountId})${assignmentPreview.rescuer.distanceKm != null ? ` · ${assignmentPreview.rescuer.distanceKm.toFixed(2)} km away` : ''}` : 'No available Barangay Rescuer'}</p>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Add required validation notes"
              className={d.form.textareaSm}
              autoFocus
            />
            {error ? <p className="backup-error">{error}</p> : null}
            <div className="backup-actions">
              <button type="button" onClick={() => updateStatus('accepted')} className="backup-button backup-button-acknowledged" disabled={busy || previewLoading || !assignmentPreview?.rescuer}>
                {busy ? 'Accepting...' : 'Confirm Accept'}
              </button>
              <button type="button" onClick={() => { setActionMode(null); setAssignmentPreview(null); setError(null); }} className="backup-button backup-button-secondary">Cancel</button>
            </div>
          </BackupModal>
        ) : null}

        {actionMode === 'decline' && selectedReport ? (
          <BackupModal
            title="Decline Rescue Request?"
            onClose={() => { setActionMode(null); setError(null); }}
          >
            <p>Choose a reason and explain why Barangay {barangayName} is declining this rescue request.</p>
            <select value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} className={d.form.selectSm} autoFocus>
              <option value="">Select reason</option>
              <option value="invalid report">Invalid report</option>
              <option value="duplicate">Duplicate</option>
              <option value="outside jurisdiction">Outside jurisdiction</option>
              <option value="false alarm">False alarm</option>
              <option value="other">Other</option>
            </select>
            <textarea
              value={declineExplanation}
              onChange={(event) => setDeclineExplanation(event.target.value)}
              placeholder="Explain why this report is declined"
              className={d.form.textareaSm}
            />
            {error ? <p className="backup-error">{error}</p> : null}
            <div className="backup-actions">
              <button type="button" onClick={() => updateStatus('declined')} className="backup-button" disabled={busy}>
                {busy ? 'Declining...' : 'Confirm Decline'}
              </button>
              <button type="button" onClick={() => { setActionMode(null); setError(null); }} className="backup-button backup-button-secondary">Cancel</button>
            </div>
          </BackupModal>
        ) : null}

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
        <IncidentHistoryModal open={showIncidentHistory} scopeLabel={`Barangay ${barangayName}`} onClose={() => setShowIncidentHistory(false)} onAuthError={onAuthError} />
      </div>
    </BarangayShell>
  );
}
