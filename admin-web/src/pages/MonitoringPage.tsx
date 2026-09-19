import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/apiClient';
import AdminShell from '../components/AdminShell';
import { d } from '../adminDesign';
import type { BackupRequest, EvacuationAreaItem, MonitoringReport, RescuerAccount } from '../types';
import { buildCalambaMapHtml } from '../utils/calambaMapHtml';

type Props = {
  onLogout: () => void;
  onOpenDashboard: () => void;
  onOpenAdmin: () => void;
  onOpenUsers: () => void;
  onOpenBarangay: () => void;
  onOpenRescuers: () => void;
  onOpenEvacuationAreas: () => void;
  onOpenPostUpdates: () => void;
  onOpenFloodMonitoring: () => void;
  onAuthError: () => void;
  backupReportId?: number | null;
};

type Coordinate = { latitude: number; longitude: number };
type ActionMode = 'accept' | 'decline' | 'in_progress' | 'resolved' | null;
type RainRankingItem = {
  barangayName: string;
  rainIntensityMmPerHour: number;
  rainLevel: 'Light' | 'Moderate' | 'Heavy' | 'Severe';
};
type MonitoringLayerVisibility = {
  boundary: boolean;
  floodHazard: boolean;
  evacuationAreas: boolean;
  incidentMarkers: boolean;
  responderRoute: boolean;
  weatherOverlay: boolean;
  windOverlay: boolean;
};

const ACTIVE_RESCUE_STATUSES = new Set(['pending', 'accepted', 'in_progress']);
const CDRRMD_LOCATION: Coordinate = { latitude: 14.194052, longitude: 121.159688 };

function isActiveRescueStatus(value?: string | null) {
  return ACTIVE_RESCUE_STATUSES.has(String(value || '').toLowerCase());
}

function extractCoordinate(value?: string | null, lat?: number | null, lon?: number | null): Coordinate | null {
  if (lat !== null && lat !== undefined && lon !== null && lon !== undefined && Number.isFinite(lat) && Number.isFinite(lon)) {
    return { latitude: Number(lat), longitude: Number(lon) };
  }

  const text = String(value || '');
  const match = text.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

async function fetchRoadRoute(from: Coordinate, to: Coordinate) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/${from.longitude},${from.latitude};` +
    `${to.longitude},${to.latitude}?overview=full&geometries=geojson&alternatives=true&steps=false`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OSRM ${response.status}`);
  }

  const data = (await response.json()) as {
    routes?: Array<{ distance?: number; duration?: number; geometry?: { coordinates?: number[][] } }>;
  };

  const route = data.routes
    ?.filter((candidate) => Number.isFinite(candidate.distance) && candidate.geometry?.coordinates?.length)
    .sort((left, right) => Number(left.distance) - Number(right.distance))[0];
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
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatType(value?: string | null) {
  return String(value || '-')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function distanceSquared(a: Coordinate, b: Coordinate) {
  const dLat = a.latitude - b.latitude;
  const dLon = a.longitude - b.longitude;
  return dLat * dLat + dLon * dLon;
}

export default function MonitoringPage({ onLogout, onOpenDashboard, onOpenAdmin, onOpenUsers, onOpenBarangay, onOpenRescuers, onOpenEvacuationAreas, onOpenPostUpdates, onOpenFloodMonitoring, onAuthError, backupReportId = null }: Props) {
  const [evacuationAreas, setEvacuationAreas] = useState<EvacuationAreaItem[]>([]);
  const [reports, setReports] = useState<MonitoringReport[]>([]);
  const [backupRequests, setBackupRequests] = useState<BackupRequest[]>([]);
  const [rescuers, setRescuers] = useState<RescuerAccount[]>([]);
  const [rescuerChoice, setRescuerChoice] = useState('');
  const [selectedReportId, setSelectedReportId] = useState<number | null>(backupReportId);
  const [routeCoordinates, setRouteCoordinates] = useState<Coordinate[]>([]);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeEtaMinutes, setRouteEtaMinutes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMap, setLoadingMap] = useState(true);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | 'pending' | 'accepted' | 'in_progress' | 'resolved' | 'declined'>('active');
  const [notes, setNotes] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const mapWrapRef = useRef<HTMLElement | null>(null);
  const [declineExplanation, setDeclineExplanation] = useState('');
  const [layerVisibility] = useState<MonitoringLayerVisibility>({
    boundary: true,
    floodHazard: false,
    evacuationAreas: true,
    incidentMarkers: true,
    responderRoute: true,
    weatherOverlay: true,
    windOverlay: false,
  });
  const [topRainBarangays, setTopRainBarangays] = useState<RainRankingItem[]>([]);
  const [rainLegendUpdatedAt, setRainLegendUpdatedAt] = useState<string | null>(null);

  async function loadData(showLoading = true) {
    if (showLoading) {
      setLoadingMap(true);
    }

    try {
      const [areasResponse, reportsResponse, backupResponse, rescuerResponse] = await Promise.all([
        api.get('/content/evacuation-areas'),
        api.get('/reports'),
        api.get('/backup-requests'),
        api.get('/rescuers/accounts'),
      ]);

      const nextAreas = Array.isArray(areasResponse.data) ? areasResponse.data : [];
      const nextReports = Array.isArray(reportsResponse.data) ? reportsResponse.data : [];

      setEvacuationAreas(nextAreas);
      setReports(nextReports);
      setBackupRequests(Array.isArray(backupResponse.data) ? backupResponse.data : []);
      setRescuers(Array.isArray(rescuerResponse.data) ? rescuerResponse.data : []);

      if (nextReports.length > 0 && !nextReports.some((item: MonitoringReport) => item.id === selectedReportId)) {
        setSelectedReportId(nextReports[0].id);
      }
      if (nextReports.length === 0) {
        setSelectedReportId(null);
      }

      setError(null);
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      setError(apiError.response?.data?.message || 'Failed to load monitoring data.');
    } finally {
      if (showLoading) {
        setLoadingMap(false);
      }
    }
  }

  async function loadRainRanking() {
    try {
      const rainImpactResponse = await api.get('/flood-risk/calamba/rain-impact').catch(() => ({ data: null }));
      const rainPayload = rainImpactResponse?.data as {
        updatedAt?: string;
        barangayImpacts?: Array<{
          barangayName?: string;
          rainIntensityMmPerHour?: number;
          rainLevel?: string;
          thunderstormProbabilityPct?: number;
          stormRisk?: string;
          typhoonForecastImpact?: string;
        }>;
      } | null;
      const impacts = Array.isArray(rainPayload?.barangayImpacts) ? rainPayload.barangayImpacts : [];

      const ranked = impacts
        .map((item) => {
          const rain = Number(item?.rainIntensityMmPerHour || 0);
          const normalizedLevel = String(item?.rainLevel || 'Light');
          const level = (normalizedLevel === 'Severe' || normalizedLevel === 'Heavy' || normalizedLevel === 'Moderate')
            ? normalizedLevel
            : 'Light';

          return {
            barangayName: String(item?.barangayName || 'Barangay'),
            rainIntensityMmPerHour: Number.isFinite(rain) ? rain : 0,
            rainLevel: level as RainRankingItem['rainLevel'],
          };
        })
        .filter((item) => item.rainIntensityMmPerHour > 2.5) // Moderate and above only (>2.5 mm/hr)
        .sort((a, b) => b.rainIntensityMmPerHour - a.rainIntensityMmPerHour);

      setTopRainBarangays(ranked);
      setRainLegendUpdatedAt(rainPayload?.updatedAt || new Date().toISOString());
    } catch {
      // Keep existing ranking if rain feed is temporarily unavailable.
    }
  }

  useEffect(() => {
    loadData(true).catch(() => {});
    loadRainRanking().catch(() => {});

    const refreshTimer = setInterval(() => {
      loadData(false).catch(() => {});
    }, 5000);

    const rainTimer = setInterval(() => {
      loadRainRanking().catch(() => {});
    }, 10000);

    return () => {
      clearInterval(refreshTimer);
      clearInterval(rainTimer);
    };
  }, []);

  const rescueReports = useMemo(
    () => reports,
    [reports],
  );

  const activeRescueReports = useMemo(
    () => rescueReports.filter((item) => isActiveRescueStatus(item.status)),
    [rescueReports],
  );

  const filteredReports = useMemo(() => {
    if (statusFilter === 'active') {
      return activeRescueReports;
    }
    return rescueReports.filter((item) => String(item.status).toLowerCase() === statusFilter);
  }, [activeRescueReports, rescueReports, statusFilter]);

  const selectedReport = useMemo(
    () => filteredReports.find((item) => item.id === selectedReportId) ?? filteredReports[0] ?? null,
    [filteredReports, selectedReportId],
  );

  const selectedBackup = useMemo(
    () => selectedReport ? backupRequests.find((request) => request.report_id === selectedReport.id) || null : null,
    [backupRequests, selectedReport],
  );

  const isBackupResponse = Boolean(
    selectedReport
    && selectedBackup?.acknowledged_at
    && selectedReport.report_type === 'rescue'
    && isActiveRescueStatus(selectedReport.status),
  );

  const liveResponderLocation = useMemo<Coordinate | null>(() => {
    const latitude = Number(selectedBackup?.rescuer_latitude);
    const longitude = Number(selectedBackup?.rescuer_longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  }, [selectedBackup]);

  const assignedResponderArea = useMemo(() => {
    if (!selectedReport || !isActiveRescueStatus(selectedReport.status)) {
      return null;
    }

    if (evacuationAreas.length === 0) {
      return null;
    }

    const explicitAreaId = Number(selectedReport.evacuation_area_id);
    if (Number.isFinite(explicitAreaId)) {
      const byId = evacuationAreas.find((area) => area.id === explicitAreaId && Boolean(area.is_active)) || null;
      if (byId) {
        return byId;
      }
    }

    const explicitAreaName = String(selectedReport.evacuation_area_name || '').trim().toLowerCase();
    if (explicitAreaName) {
      const byName = evacuationAreas.find((area) => String(area.name || '').trim().toLowerCase() === explicitAreaName && Boolean(area.is_active)) || null;
      if (byName) {
        return byName;
      }
    }

    const incidentPoint = extractCoordinate(selectedReport.location, selectedReport.latitude, selectedReport.longitude);
    if (!incidentPoint) {
      return null;
    }

    return evacuationAreas
      .filter((area) => Boolean(area.is_active))
      .map((area) => ({
        area,
        dist: distanceSquared(incidentPoint, { latitude: area.latitude, longitude: area.longitude }),
      }))
      .sort((a, b) => a.dist - b.dist)[0]?.area ?? null;
  }, [evacuationAreas, selectedReport]);

  const nearestTeamLabel = useMemo(() => {
    if (!assignedResponderArea) {
      return null;
    }
    return `${assignedResponderArea.name} Response Team (${assignedResponderArea.barangay})`;
  }, [assignedResponderArea]);

  const responderLocation = useMemo(() => {
    if (liveResponderLocation) {
      return liveResponderLocation;
    }
    if (isBackupResponse) {
      return CDRRMD_LOCATION;
    }
    if (!assignedResponderArea) {
      return null;
    }
    return { latitude: assignedResponderArea.latitude, longitude: assignedResponderArea.longitude };
  }, [assignedResponderArea, isBackupResponse, liveResponderLocation]);

  const selectedIncidentLocation = useMemo(() => {
    if (!selectedReport || !isActiveRescueStatus(selectedReport.status)) {
      return null;
    }
    if (selectedBackup?.picked_up_at) {
      const latitude = Number(selectedBackup.evacuation_latitude);
      const longitude = Number(selectedBackup.evacuation_longitude);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) return { latitude, longitude };
    }
    return extractCoordinate(selectedReport.location, selectedReport.latitude, selectedReport.longitude);
  }, [selectedBackup, selectedReport]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedReport || !isActiveRescueStatus(selectedReport.status)) {
      setRouteCoordinates([]);
      setRouteDistanceKm(null);
      setRouteEtaMinutes(null);
      return undefined;
    }

    if (!selectedIncidentLocation || !responderLocation) {
      setRouteCoordinates([]);
      setRouteDistanceKm(null);
      setRouteEtaMinutes(null);
      return undefined;
    }

    fetchRoadRoute(responderLocation, selectedIncidentLocation)
      .then((route) => {
        if (cancelled) return;
        setRouteCoordinates(route.coordinates);
        setRouteDistanceKm(route.distanceKm);
        setRouteEtaMinutes(route.etaMinutes);
      })
      .catch(() => {
        if (cancelled) return;
        setRouteCoordinates([responderLocation, selectedIncidentLocation]);
        setRouteDistanceKm(null);
        setRouteEtaMinutes(null);
      });
    return () => { cancelled = true; };
  }, [responderLocation, selectedIncidentLocation, selectedReport]);

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setIsMapFullscreen(false);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  function enterMapFullscreen() {
    const el = mapWrapRef.current;
    if (el && el.requestFullscreen) {
      el.requestFullscreen().then(() => setIsMapFullscreen(true)).catch(() => {});
    }
  }

  function exitMapFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().then(() => setIsMapFullscreen(false)).catch(() => {});
    }
  }

  const mapHtml = useMemo(
    () => buildCalambaMapHtml(
      evacuationAreas,
      responderLocation,
      routeCoordinates,
      selectedIncidentLocation,
      selectedReport && isActiveRescueStatus(selectedReport.status)
        ? (selectedReport.report_code || `RPT-${String(selectedReport.id).padStart(6, '0')}`)
        : null,
      activeRescueReports
        .map((item) => ({
          reportCode: item.report_code || `RPT-${String(item.id).padStart(6, '0')}`,
          latitude: Number(item.latitude),
          longitude: Number(item.longitude),
          status: String(item.status || 'pending'),
          reportType: String(item.report_type || 'incident'),
        }))
        .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)),
      `${String(api.defaults.baseURL || 'http://localhost:4000/api').replace(/\/$/, '')}/flood-risk/calamba/barangays`,
      `${String(api.defaults.baseURL || 'http://localhost:4000/api').replace(/\/$/, '')}/flood-risk/calamba/raster`,
      `${String(api.defaults.baseURL || 'http://localhost:4000/api').replace(/\/$/, '')}/flood-risk/calamba/rain-impact`,
      `${String(api.defaults.baseURL || 'http://localhost:4000/api').replace(/\/$/, '')}/weather/wind-field`,
      layerVisibility,
      liveResponderLocation
        ? 'Assigned CDRRMD Rescuer live location'
        : isBackupResponse ? 'CDRRMD - Calamba City Hall' : 'Closest responder base',
    ),
    [activeRescueReports, evacuationAreas, isBackupResponse, layerVisibility, liveResponderLocation, responderLocation, routeCoordinates, selectedIncidentLocation, selectedReport],
  );

  const stats = useMemo(() => {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    return {
      totalReportsToday: rescueReports.filter((item) => new Date(item.created_at).getTime() >= dayStart).length,
      pending: rescueReports.filter((item) => item.status === 'pending').length,
      inProgress: rescueReports.filter((item) => item.status === 'in_progress').length,
      resolved: rescueReports.filter((item) => item.status === 'resolved').length,
    };
  }, [rescueReports]);

  async function updateStatus(nextStatus: 'accepted' | 'declined' | 'in_progress' | 'resolved') {
    if (!selectedReport || busy) {
      return;
    }

    if (nextStatus === 'accepted' && !notes.trim()) {
      setError('Admin notes are required before accepting.');
      return;
    }

    if (nextStatus === 'declined' && (!declineReason.trim() || !declineExplanation.trim())) {
      setError('Decline reason and explanation are required.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await api.patch(`/reports/${selectedReport.id}/status`, {
        status: nextStatus,
        assignTeam: nearestTeamLabel || '',
        notes: nextStatus === 'accepted' ? notes : '',
        dispatchConfirmed: nextStatus === 'accepted',
        declineReason,
        declineExplanation,
      });

      setActionMode(null);
      setNotes('');
      setDeclineReason('');
      setDeclineExplanation('');
      await loadData(false);
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      setError(apiError.response?.data?.message || 'Failed to update report status.');
    } finally {
      setBusy(false);
    }
  }

  async function assignRescuer() {
    if (!selectedBackup || !rescuerChoice || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/backup-requests/${selectedBackup.id}/assign`, { rescuerId: Number(rescuerChoice) });
      setRescuerChoice('');
      await loadData(false);
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) return onAuthError();
      setError(apiError.response?.data?.message || 'Failed to assign the CDRRMD Rescuer team.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell
      activeView="monitoring"
      title="Incident Monitoring"
      noMainScroll
      onLogout={onLogout}
      onOpenDashboard={onOpenDashboard}
      onOpenAdmin={onOpenAdmin}
      onOpenUsers={onOpenUsers}
        onOpenBarangay={onOpenBarangay}
      onOpenRescuers={onOpenRescuers}
      onOpenMonitoring={() => {}}
      onOpenFloodMonitoring={onOpenFloodMonitoring}
      onOpenEvacuationAreas={onOpenEvacuationAreas}
      onOpenPostUpdates={onOpenPostUpdates}
      actions={<button onClick={onOpenEvacuationAreas} className={d.monitoring.actionEvac}>Evacuation Readiness</button>}
    >
      <div className={d.monitoring.root}>
        {error ? <div className={d.page.error}>{error}</div> : null}

        <section className={d.monitoring.statsGrid}>
          <article className={[d.monitoring.statCardBase, d.monitoring.statReports].join(' ')}><p className={d.monitoring.statLabel}>Reports Today</p><p className={d.monitoring.statValue}>{stats.totalReportsToday}</p></article>
          <article className={[d.monitoring.statCardBase, d.monitoring.statPending].join(' ')}><p className={d.monitoring.statLabel}>Pending</p><p className={d.monitoring.statValue}>{stats.pending}</p></article>
          <article className={[d.monitoring.statCardBase, d.monitoring.statInProgress].join(' ')}><p className={d.monitoring.statLabel}>In Progress</p><p className={d.monitoring.statValue}>{stats.inProgress}</p></article>
          <article className={[d.monitoring.statCardBase, d.monitoring.statResolved].join(' ')}><p className={d.monitoring.statLabel}>Resolved</p><p className={d.monitoring.statValue}>{stats.resolved}</p></article>
        </section>

        {/* Map + rainfall/selected-incident side panel */}
        <section className={d.monitoring.mainGrid}>
          <article
            ref={mapWrapRef}
            className={d.monitoring.mapCard}
            style={isMapFullscreen ? { position: 'fixed', inset: 0, zIndex: 9999, borderRadius: 0, minHeight: '100dvh', display: 'flex', flexDirection: 'column' } : { position: 'relative' }}
          >
            <iframe title="Monitoring map" srcDoc={mapHtml} className={d.monitoring.mapFrame} />
            {!isMapFullscreen ? (
              <button
                onClick={enterMapFullscreen}
                title="Enter fullscreen"
                style={{
                  position: 'absolute', bottom: 10, right: 10, zIndex: 1000,
                  background: 'rgba(15,23,42,0.82)', border: '1px solid rgba(148,163,184,0.3)',
                  borderRadius: 8, color: '#fff', cursor: 'pointer', padding: '6px 7px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backdropFilter: 'blur(4px)', boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                  <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                </svg>
              </button>
            ) : (
              <button
                onClick={exitMapFullscreen}
                title="Exit fullscreen"
                style={{
                  position: 'absolute', bottom: 16, right: 16, zIndex: 10000,
                  background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(148,163,184,0.4)',
                  borderRadius: 8, color: '#fff', cursor: 'pointer', padding: '7px 8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backdropFilter: 'blur(4px)', boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
                  <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
                </svg>
              </button>
            )}
          </article>

          <aside className={d.monitoring.mapSideColumn}>
            <section className={[d.monitoring.rainRankCard, selectedReport ? 'max-h-[55%]' : 'h-full'].join(' ')}>
              <div className={d.monitoring.rainRankHead}>
                <div>
                  <h3 className={d.monitoring.rainRankTitle}>Barangays with Moderate–Severe Rainfall</h3>
                  <p className={d.monitoring.rainRankUpdated}>
                    Updated: {rainLegendUpdatedAt ? new Date(rainLegendUpdatedAt).toLocaleTimeString() : '-'}
                  </p>
                </div>
              </div>
              {topRainBarangays.length === 0 ? (
                <p className={d.monitoring.rainRankEmpty}>No moderate or severe rainfall detected right now.</p>
              ) : (
                <div className={d.monitoring.rainRankSideList}>
                  {topRainBarangays.map((item, index) => (
                    <article key={`${item.barangayName}-${index}`} className={d.monitoring.rainRankRow}>
                      <p className={d.monitoring.rainRankName}>{`${index + 1}. ${item.barangayName}`}</p>
                      <p className={d.monitoring.rainRankMeta}>Intensity: {item.rainIntensityMmPerHour.toFixed(2)} mm/hr</p>
                      <p className={d.monitoring.rainRankMeta}>Risk: {item.rainLevel}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {selectedReport ? (
            <article className={d.monitoring.selectedCard} style={{ overflowY: 'auto', minWidth: 0 }}>
              <h3 className={d.monitoring.selectedTitle}>Selected Incident</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem' }}>
                <p><strong>ID:</strong> {selectedReport.report_code || `RPT-${String(selectedReport.id).padStart(6, '0')}`}</p>
                <p><strong>Type:</strong> {formatType(selectedReport.report_type)}</p>
                <p><strong>Status:</strong> {formatStatus(selectedReport.status)}</p>
                <p><strong>Location:</strong> {selectedReport.location}</p>
                <p><strong>Reporter:</strong> {`${selectedReport.first_name || ''} ${selectedReport.last_name || ''}`.trim() || selectedReport.email || 'N/A'}</p>
                <p><strong>Contact:</strong> {selectedReport.contact_number || 'N/A'}</p>
                <p><strong>Reported:</strong> {new Date(selectedReport.created_at).toLocaleString()}</p>
                <p><strong>Assigned Team:</strong> {selectedReport.assigned_team || '-'}</p>
                {selectedBackup ? <p><strong>Backup:</strong> {selectedBackup.assigned_rescuer_id ? `Assigned to ${selectedBackup.rescuer_name || selectedBackup.rescuer_account_id}` : selectedBackup.acknowledged_at ? 'Confirmed - awaiting team assignment' : 'Awaiting Admin confirmation'}</p> : null}
                <p><strong>Evacuation Destination:</strong> {selectedReport.evacuation_area_name || '-'}</p>
                <p><strong>Route Origin:</strong> {liveResponderLocation
                  ? 'Assigned CDRRMD Rescuer live location'
                  : isBackupResponse ? 'CDRRMD - Calamba City Hall'
                  : assignedResponderArea ? `${assignedResponderArea.name} (${assignedResponderArea.barangay})` : 'No nearby active evacuation area'}</p>
                {selectedBackup?.picked_up_at ? <p><strong>Current Destination:</strong> {selectedReport.evacuation_area_name || 'Designated evacuation center'}</p> : null}
                <p><strong>Admin Notes:</strong> {selectedReport.admin_notes || '-'}</p>
                <p><strong>Distance:</strong> {routeDistanceKm ? `${routeDistanceKm.toFixed(2)} km` : 'Calculating...'}</p>
                <p><strong>ETA:</strong> {routeEtaMinutes ? `${routeEtaMinutes} mins` : 'Calculating...'}</p>
              </div>
            </article>
            ) : null}
          </aside>
        </section>

        <section className={d.monitoring.lowerGrid}>
          <article className={d.monitoring.incidentsCard}>
            <div className={d.monitoring.incidentsHead}>
              <h3 className={d.monitoring.incidentsTitle}>Active Incidents</h3>
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
                    <th>Incident ID</th><th>Type</th><th>Location</th><th>Status</th><th>Team</th><th>Proof</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReports.length === 0 ? (
                    <tr><td colSpan={6} className={d.table.empty}>No incidents yet.</td></tr>
                  ) : filteredReports.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedReportId(item.id)}
                      className={[d.monitoring.rowBase, selectedReport?.id === item.id ? d.monitoring.rowSelected : null].filter(Boolean).join(' ')}
                    >
                      <td>{item.report_code || `RPT-${String(item.id).padStart(6, '0')}`}</td>
                      <td>{formatType(item.report_type)}</td>
                      <td className={d.monitoring.rowLocation}>{item.location}</td>
                      <td><span className={d.monitoring.statusChip}>{formatStatus(item.status)}</span></td>
                      <td>{item.assigned_team || '-'}</td>
                      <td>
                        {item.image_base64 ? (
                          <button onClick={(event) => { event.stopPropagation(); setPreviewImage(item.image_base64 || null); }} className={d.btn.secondaryXs}>View</button>
                        ) : <span className={d.monitoring.muted}>-</span>}
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
                <p className={d.monitoring.validationEmpty}>Select a report to update status.</p>
              ) : (
                <div className={d.monitoring.validationStack}>
                <p className={d.monitoring.validationCurrent}>Current status: {formatStatus(selectedReport.status)}</p>
                {selectedBackup?.acknowledged_at ? (
                  <div className={d.monitoring.actionBox}>
                    <p className={d.monitoring.validationCurrent}>CDRRMD Backup Assignment</p>
                    {selectedBackup.assigned_rescuer_id ? (
                      <p className={d.monitoring.assignNote}>
                        Assigned to {selectedBackup.rescuer_name || selectedBackup.rescuer_account_id}. The Admin tracks the response; the CDRRMD and Barangay teams perform the rescue together.
                      </p>
                    ) : (
                      <>
                        <select value={rescuerChoice} onChange={(event) => setRescuerChoice(event.target.value)} className={d.form.selectSm}>
                          <option value="">Select an available CDRRMD Rescuer</option>
                          {rescuers.filter((rescuer) => rescuer.is_available).map((rescuer) => (
                            <option key={rescuer.id} value={rescuer.id}>{rescuer.rescuer_id} - {[rescuer.first_name, rescuer.last_name].filter(Boolean).join(' ') || rescuer.username}</option>
                          ))}
                        </select>
                        <button onClick={() => void assignRescuer()} className={d.btn.acceptDisabled} disabled={busy || !rescuerChoice}>Assign Rescuer Team</button>
                        {!rescuers.some((rescuer) => rescuer.is_available) ? <p className="text-amber-700">No CDRRMD Rescuer team is currently available. Add a team in Accounts or complete an active assignment.</p> : null}
                      </>
                    )}
                  </div>
                ) : null}
                {selectedReport.status === 'pending' ? (
                  <div className={d.monitoring.actionRow}>
                    <button onClick={() => setActionMode('accept')} className={d.btn.acceptDisabled} disabled={busy}>Accept</button>
                    <button onClick={() => setActionMode('decline')} className={d.btn.declineDisabled} disabled={busy}>Decline</button>
                  </div>
                ) : null}
                {selectedReport.status === 'accepted' && !selectedBackup ? (
                  <button onClick={() => setActionMode('in_progress')} className={d.btn.inProgressDisabled} disabled={busy}>Mark In Progress</button>
                ) : null}
                {selectedReport.status === 'in_progress' && !selectedBackup ? (
                  <button onClick={() => setActionMode('resolved')} className={d.btn.resolvedDisabled} disabled={busy}>Mark Resolved</button>
                ) : null}
                {actionMode === 'accept' ? (
                  <div className={d.monitoring.actionBox}>
                    <p className={d.monitoring.assignNote}>Team assignment: {nearestTeamLabel || 'No nearby active evacuation area'}</p>
                    <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add dispatch notes" className={d.form.textareaSm} />
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
                {actionMode === 'in_progress' ? (
                  <div className={d.monitoring.actionSoloBox}>
                    <p>Proceed to move this incident into active response state?</p>
                    <div className={d.monitoring.actionRow}>
                      <button onClick={() => updateStatus('in_progress')} className={d.btn.inProgressDisabled} disabled={busy}>Continue</button>
                      <button onClick={() => setActionMode(null)} className={d.btn.secondaryXs} disabled={busy}>Cancel</button>
                    </div>
                  </div>
                ) : null}
                {actionMode === 'resolved' ? (
                  <div className={d.monitoring.actionSoloBox}>
                    <p>Mark this incident as resolved?</p>
                    <div className={d.monitoring.actionRow}>
                      <button onClick={() => updateStatus('resolved')} className={d.btn.resolvedDisabled} disabled={busy}>Continue</button>
                      <button onClick={() => setActionMode(null)} className={d.btn.secondaryXs} disabled={busy}>Cancel</button>
                    </div>
                  </div>
                ) : null}
                </div>
              )}
            </div>
          </article>
        </section>

        {loadingMap ? <p className={d.page.loading}>Loading monitoring map...</p> : null}

        {previewImage ? (
          <div className={d.modal.overlay}>
            <div className={d.modal.card}>
              <div className={d.modal.header}>
                <h4 className={d.modal.title}>Report Proof Image</h4>
                <button onClick={() => setPreviewImage(null)} className={d.modal.close}>Close</button>
              </div>
              <img src={previewImage} alt="Report proof" className={d.modal.image} />
            </div>
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
