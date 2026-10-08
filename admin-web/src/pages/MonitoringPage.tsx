import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/apiClient';
import { fetchRoadRoute } from '../services/roadRouting';
import AdminShell from '../components/AdminShell';
import IncidentHistoryModal from '../components/IncidentHistoryModal';
import { d } from '../adminDesign';
import type { BackupRequest, EvacuationAreaItem, MonitoringReport, RescuerAccount } from '../types';
import { buildCalambaMapHtml } from '../utils/calambaMapHtml';
import { formatIncidentStatus, INCIDENT_STATUS_FILTERS, type IncidentStatusFilter } from '../utils/incidentStatus';

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
  onOpenBackupRequest: (reportId: number) => void;
  onAuthError: () => void;
  backupReportId?: number | null;
};

type Coordinate = { latitude: number; longitude: number };
type ActionMode = 'accept' | 'decline' | null;
type AssignmentPreview = {
  reportNotes: string | null;
  barangayNotes: string | null;
  rescuer: {
    rescuerId: number;
    rescuerName: string;
    rescuerAccountId: string;
    distanceKm: number | null;
    isOnline: boolean;
  } | null;
};
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
  temperatureOverlay: boolean;
  humidityOverlay: boolean;
  windOverlay: boolean;
};
type CityRescuerLocation = RescuerAccount & { kind: 'barangay' | 'cddrmd' };

const ACTIVE_RESCUE_STATUSES = new Set(['pending', 'accepted', 'in_progress']);

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

function distanceSquared(a: Coordinate, b: Coordinate) {
  const dLat = a.latitude - b.latitude;
  const dLon = a.longitude - b.longitude;
  return dLat * dLat + dLon * dLon;
}

export default function MonitoringPage({ onLogout, onOpenDashboard, onOpenAdmin, onOpenUsers, onOpenBarangay, onOpenRescuers, onOpenEvacuationAreas, onOpenPostUpdates, onOpenFloodMonitoring, onOpenBackupRequest, onAuthError, backupReportId = null }: Props) {
  const [evacuationAreas, setEvacuationAreas] = useState<EvacuationAreaItem[]>([]);
  const [reports, setReports] = useState<MonitoringReport[]>([]);
  const [backupRequests, setBackupRequests] = useState<BackupRequest[]>([]);
  const [cityRescuers, setCityRescuers] = useState<CityRescuerLocation[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(backupReportId);
  const [mapFocusedReportId, setMapFocusedReportId] = useState<number | null>(null);
  const [mapFocusMode, setMapFocusMode] = useState<'location' | 'route' | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<Coordinate[]>([]);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeEtaMinutes, setRouteEtaMinutes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMap, setLoadingMap] = useState(true);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showIncidentHistory, setShowIncidentHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [assignmentPreview, setAssignmentPreview] = useState<AssignmentPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<IncidentStatusFilter>('active');
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [showRainRanking, setShowRainRanking] = useState(false);
  const mapWrapRef = useRef<HTMLElement | null>(null);
  const mapFrameRef = useRef<HTMLIFrameElement | null>(null);
  const lastFocusedRescue = useRef('');
  const [mapReady, setMapReady] = useState(false);
  const [declineExplanation, setDeclineExplanation] = useState('');
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
  const [topRainBarangays, setTopRainBarangays] = useState<RainRankingItem[]>([]);
  const [rainLegendUpdatedAt, setRainLegendUpdatedAt] = useState<string | null>(null);

  const loadData = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoadingMap(true);
    }

    try {
      const [areasResponse, reportsResponse, backupResponse, cdrrmdResponse, barangayResponderResponse] = await Promise.all([
        api.get('/content/evacuation-areas'),
        api.get('/reports'),
        api.get('/backup-requests'),
        api.get('/rescuers/accounts', { params: { role: 'rescuer' } }),
        api.get('/rescuers/accounts', { params: { role: 'barangay_rescuer' } }),
      ]);

      const nextAreas = Array.isArray(areasResponse.data) ? areasResponse.data : [];
      const nextReports = Array.isArray(reportsResponse.data) ? reportsResponse.data : [];

      setEvacuationAreas(nextAreas);
      setReports(nextReports);
      setBackupRequests(Array.isArray(backupResponse.data) ? backupResponse.data : []);
      setCityRescuers([
        ...(Array.isArray(cdrrmdResponse.data) ? cdrrmdResponse.data : []).map((rescuer: RescuerAccount) => ({ ...rescuer, kind: 'cddrmd' as const })),
        ...(Array.isArray(barangayResponderResponse.data) ? barangayResponderResponse.data : []).map((rescuer: RescuerAccount) => ({ ...rescuer, kind: 'barangay' as const })),
      ]);

      setSelectedReportId((currentId) => {
        if (nextReports.length === 0) return null;
        return nextReports.some((item: MonitoringReport) => item.id === currentId)
          ? currentId
          : nextReports[0].id;
      });

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
  }, [onAuthError]);

  const loadRainRanking = useCallback(async () => {
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
  }, []);

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
  }, [loadData, loadRainRanking]);

  const rescueReports = useMemo(
    () => reports.filter((report) => backupRequests.some((request) => request.report_id === report.id)),
    [backupRequests, reports],
  );

  const activeRescueReports = useMemo(
    () => rescueReports.filter((item) => isActiveRescueStatus(item.status)),
    [rescueReports],
  );

  const activeMissionReports = useMemo(
    () => reports.filter((report) => isActiveRescueStatus(report.status) && Boolean(report.assigned_rescuer_id)),
    [reports],
  );

  const filteredReports = useMemo(() => {
    if (statusFilter === 'active') {
      return activeRescueReports;
    }
    return rescueReports.filter((item) => String(item.status).toLowerCase() === statusFilter);
  }, [activeRescueReports, rescueReports, statusFilter]);

  const selectedReport = useMemo(
    () => filteredReports.find((item) => item.id === selectedReportId)
      ?? reports.find((item) => item.id === selectedReportId)
      ?? filteredReports[0]
      ?? null,
    [filteredReports, reports, selectedReportId],
  );

  const selectedBackup = useMemo(
    () => selectedReport ? backupRequests.find((request) => request.report_id === selectedReport.id) || null : null,
    [backupRequests, selectedReport],
  );

  const isBackupResponse = Boolean(
    selectedReport
    && selectedBackup?.acknowledged_at
    && selectedBackup?.responder_acknowledged_at
    && selectedReport.report_type === 'rescue'
    && isActiveRescueStatus(selectedReport.status),
  );

  const liveResponderLocation = useMemo<Coordinate | null>(() => {
    const latitude = Number(selectedReport?.rescuer_latitude);
    const longitude = Number(selectedReport?.rescuer_longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  }, [selectedReport?.rescuer_latitude, selectedReport?.rescuer_longitude]);

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

  const responderLocation = useMemo(() => {
    return liveResponderLocation;
  }, [liveResponderLocation]);

  const selectedReportedLocation = useMemo(
    () => extractCoordinate(selectedReport?.location, selectedReport?.latitude, selectedReport?.longitude),
    [selectedReport],
  );

  const selectedIncidentLocation = useMemo(() => {
    if (!selectedReport || !isActiveRescueStatus(selectedReport.status)) return null;
    if (selectedReport.picked_up_at) {
      const latitude = Number(selectedReport.evacuation_latitude);
      const longitude = Number(selectedReport.evacuation_longitude);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) return { latitude, longitude };
    }
    return selectedReportedLocation;
  }, [selectedReport, selectedReportedLocation]);

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

  const responderPoints = useMemo(() => cityRescuers
    .map((rescuer) => {
      const activeAssignment = activeMissionReports.find((report) => Number(report.assigned_rescuer_id) === Number(rescuer.id));
      return {
        id: rescuer.id,
        rescuerId: rescuer.rescuer_id || null,
        name: [rescuer.first_name, rescuer.last_name].filter(Boolean).join(' ') || rescuer.rescuer_id || 'Rescuer',
        latitude: rescuer.current_latitude == null ? Number.NaN : Number(rescuer.current_latitude),
        longitude: rescuer.current_longitude == null ? Number.NaN : Number(rescuer.current_longitude),
        isAvailable: !activeAssignment && rescuer.is_available !== false,
        activeReportId: activeAssignment?.id || null,
        activeReportCode: activeAssignment?.report_code || null,
        barangayName: rescuer.barangay_name || null,
        kind: rescuer.kind,
      };
    })
    .filter((rescuer) => Number.isFinite(rescuer.latitude) && Number.isFinite(rescuer.longitude)), [activeMissionReports, cityRescuers]);

  const selectedResponderKind = selectedReport?.dispatch_type === 'cddrmd_backup' ? 'cddrmd' : 'barangay';

  const mapHtml = useMemo(
    () => buildCalambaMapHtml(
      evacuationAreas,
      null,
      [],
      null,
      null,
      [],
      `${String(api.defaults.baseURL || 'http://localhost:4000/api').replace(/\/$/, '')}/flood-risk/calamba/barangays`,
      `${String(api.defaults.baseURL || 'http://localhost:4000/api').replace(/\/$/, '')}/flood-risk/calamba/raster`,
      `${String(api.defaults.baseURL || 'http://localhost:4000/api').replace(/\/$/, '')}/flood-risk/calamba/rain-impact`,
      `${String(api.defaults.baseURL || 'http://localhost:4000/api').replace(/\/$/, '')}/weather/wind-field`,
      layerVisibility,
      'Assigned responder location',
      {
        focusOnIncident: true,
        allowLiveRouteUpdates: true,
        responderKind: 'generic',
        showForecastTimeline: isMapFullscreen,
      },
    ),
    [evacuationAreas, isMapFullscreen, layerVisibility],
  );

  useEffect(() => {
    function handleMapMessage(event: MessageEvent) {
      if (event.source !== mapFrameRef.current?.contentWindow || event.data?.type !== 'select-rescuer-assignment') return;
      const reportId = Number(event.data.reportId);
      if (!Number.isFinite(reportId) || !activeMissionReports.some((report) => report.id === reportId)) return;
      setRouteCoordinates([]);
      setRouteDistanceKm(null);
      setRouteEtaMinutes(null);
      setSelectedReportId(reportId);
      setMapFocusedReportId(reportId);
      setMapFocusMode('route');
    }
    window.addEventListener('message', handleMapMessage);
    return () => window.removeEventListener('message', handleMapMessage);
  }, [activeMissionReports]);

  useEffect(() => {
    if (mapFocusedReportId && !activeMissionReports.some((report) => report.id === mapFocusedReportId)) {
      if (mapFocusMode === 'route') {
        setMapFocusedReportId(null);
        setMapFocusMode(null);
      }
    }
  }, [activeMissionReports, mapFocusedReportId, mapFocusMode]);

  const postMapUpdate = useCallback((recenter = false) => {
    if (!mapReady) return;
    const hasFocusedReport = mapFocusedReportId != null && selectedReport?.id === mapFocusedReportId;
    const showFocusedRoute = hasFocusedReport && mapFocusMode === 'route';
    const showFocusedLocation = hasFocusedReport && mapFocusMode === 'location';
    mapFrameRef.current?.contentWindow?.postMessage({
      type: 'rescue-map-update',
      responderLocation: showFocusedRoute ? responderLocation : null,
      routeCoordinates: showFocusedRoute ? routeCoordinates : [],
      incidentLocation: showFocusedLocation
        ? selectedReportedLocation
        : showFocusedRoute && !selectedReport?.picked_up_at ? selectedIncidentLocation : null,
      selectedReportCode: hasFocusedReport ? selectedReport?.report_code || null : null,
      incidentPoints: [], responderPoints,
      selectedResponderId: showFocusedRoute ? selectedReport?.assigned_rescuer_id || null : null,
      responderKind: selectedResponderKind,
      pickedUp: showFocusedRoute && Boolean(selectedReport?.picked_up_at),
      recenter: hasFocusedReport && recenter,
    }, '*');
  }, [mapFocusedReportId, mapFocusMode, mapReady, responderLocation, responderPoints, routeCoordinates, selectedIncidentLocation, selectedReportedLocation, selectedReport?.assigned_rescuer_id, selectedReport?.id, selectedReport?.picked_up_at, selectedReport?.report_code, selectedResponderKind]);

  const focusKey = mapFocusedReportId && selectedReport?.id === mapFocusedReportId
    ? mapFocusMode === 'location'
      ? `location:${selectedReport.id}`
      : mapFocusMode === 'route' && selectedReport.assigned_rescuer_id
        ? `route:${selectedReport.id}:${selectedReport.assigned_rescuer_id}:${Boolean(selectedReport.picked_up_at)}`
        : ''
    : '';
  useEffect(() => {
    if (!mapReady) return;
    const shouldRecenter = Boolean(focusKey) && lastFocusedRescue.current !== focusKey;
    postMapUpdate(shouldRecenter);
    if (shouldRecenter) lastFocusedRescue.current = focusKey;
    if (!focusKey) lastFocusedRescue.current = '';
  }, [focusKey, mapReady, postMapUpdate]);

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

  async function validateBackupRequest(decision: 'accepted' | 'declined') {
    if (!selectedBackup || busy) {
      return;
    }

    if (decision === 'declined' && !declineExplanation.trim()) {
      setError('A reason is required when declining a backup request.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      if (decision === 'accepted') {
        await api.patch(`/backup-requests/${selectedBackup.id}/acknowledge`, {
          rescuerId: assignmentPreview?.rescuer?.rescuerId,
        });
      } else {
        await api.patch(`/backup-requests/${selectedBackup.id}/decline`, {
          reason: declineExplanation.trim(),
        });
      }

      setActionMode(null);
      setAssignmentPreview(null);
      setDeclineExplanation('');
      await loadData(false);
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      const message = apiError.response?.data?.message || 'Failed to validate the backup request.';
      if (decision === 'accepted') await openBackupAcceptance();
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function openBackupAcceptance() {
    if (!selectedBackup) return;
    setActionMode('accept');
    setAssignmentPreview(null);
    setPreviewLoading(true);
    setError(null);
    try {
      const { data } = await api.get<AssignmentPreview>(`/backup-requests/${selectedBackup.id}/rescuer-preview`);
      setAssignmentPreview(data);
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) return onAuthError();
      setError(apiError.response?.data?.message || 'Unable to find the nearest available CDRRMD Rescuer.');
    } finally {
      setPreviewLoading(false);
    }
  }

  const selectedReportIsResolved = selectedReport?.status === 'resolved';
  const incidentDetailContent = selectedReport ? (
    <>
      <h3 className={d.monitoring.selectedTitle}>Incident Detail</h3>
      <div className={d.monitoring.incidentDetailGrid}>
        <div className={d.monitoring.incidentDetailColumn}>
          <p><strong>ID:</strong> {selectedReport.report_code || `RPT-${String(selectedReport.id).padStart(6, '0')}`}</p>
          <p><strong>Status:</strong> {formatIncidentStatus(selectedReport.status, Boolean(selectedReport.picked_up_at))}</p>
          <p><strong>Location:</strong> {selectedReport.location}</p>
          <p><strong>Reporter:</strong> {`${selectedReport.first_name || ''} ${selectedReport.last_name || ''}`.trim() || selectedReport.email || 'N/A'}</p>
          {selectedReport.are_people_trapped ? <p><strong>People Trapped:</strong> {selectedReport.estimated_people ?? 'Unknown'}</p> : null}
          <p><strong>Assigned Team:</strong> {selectedReport.assigned_team || 'N/A'}</p>
        </div>
        <div className={d.monitoring.incidentDetailMetaColumn}>
          <p><strong>Contact:</strong> {selectedReport.contact_number || 'N/A'}</p>
          <p><strong>Reported:</strong> {new Date(selectedReport.created_at).toLocaleString()}</p>
          {selectedReport.rescuer_name ? <p><strong>Barangay Rescuer:</strong> {selectedReport.rescuer_name}</p> : null}
          <p><strong>Evacuation Area:</strong> {selectedReport.evacuation_area_name || 'N/A'}</p>
          {!selectedReportIsResolved ? <p><strong>Route Distance:</strong> {routeDistanceKm ? `${routeDistanceKm.toFixed(2)} km` : 'Calculating...'}</p> : null}
          {!selectedReportIsResolved ? <p><strong>Route ETA:</strong> {routeEtaMinutes ? `${routeEtaMinutes} mins` : 'Calculating...'}</p> : null}
          <p><strong>Admin Notes:</strong> {selectedReport.admin_notes || 'N/A'}</p>
          <p><strong>Reporter Notes:</strong> {selectedReport.notes || 'N/A'}</p>
        </div>
        {!selectedReportIsResolved ? <div className={[d.monitoring.incidentDetailWide, d.monitoring.incidentDetailColumn].join(' ')}>
          {selectedBackup ? <p><strong>Backup:</strong> {selectedBackup.assigned_rescuer_id ? `Assigned to ${selectedBackup.rescuer_name || selectedBackup.rescuer_account_id}` : selectedBackup.acknowledged_at ? 'Confirmed - awaiting team assignment' : 'Awaiting Admin confirmation'}</p> : null}
          <p><strong>Route Origin:</strong> {liveResponderLocation
            ? 'Assigned CDRRMD Rescuer live location'
            : isBackupResponse ? 'CDRRMD - Calamba City Hall'
            : assignedResponderArea ? `${assignedResponderArea.name} (${assignedResponderArea.barangay})` : 'No nearby active evacuation area'}</p>
          {selectedBackup?.picked_up_at ? <p><strong>Current Destination:</strong> {selectedReport.evacuation_area_name || 'Designated evacuation center'}</p> : null}
        </div> : null}
      </div>
    </>
  ) : <p className={d.monitoring.validationEmpty}>Select a barangay backup request to view its incident details.</p>;

  const backupValidationContent = (
    <>
      <h3 className={d.monitoring.validationTitle}>Backup Request Validation</h3>
      <div className={d.monitoring.validationScrollWrap}>
        {!selectedReport || !selectedBackup ? (
          <p className={d.monitoring.validationEmpty}>Select a barangay backup request to validate.</p>
        ) : (
          <div className={d.monitoring.validationStack}>
            <p className={d.monitoring.validationCurrent}>Barangay: {selectedBackup.barangay_name || '-'}</p>
            <p className={d.monitoring.validationCurrent}>Request status: {selectedBackup.acknowledged_at ? 'Accepted' : <span className="rounded-full bg-amber-100 px-2 py-1 font-extrabold text-amber-800">Pending</span>}</p>
            {selectedBackup.acknowledged_at ? (
              <div className={d.monitoring.actionBox}>
                <p className={d.monitoring.validationCurrent}>CDRRMD Backup Assignment</p>
                {selectedBackup.assigned_rescuer_id ? (
                  <p className={d.monitoring.assignNote}>
                    Assigned to {selectedBackup.rescuer_name || selectedBackup.rescuer_account_id}. {selectedBackup.responder_acknowledged_at ? 'Dispatch acknowledged; live response is active.' : 'Awaiting responder acknowledgment.'}
                  </p>
                ) : <p className="text-amber-700">The system is assigning the nearest available CDRRMD Rescuer automatically.</p>}
              </div>
            ) : null}
            {!selectedBackup.acknowledged_at ? (
              <div className={d.monitoring.actionRow}>
                <button onClick={() => void openBackupAcceptance()} className={d.btn.acceptDisabled} disabled={busy}>Accept</button>
                <button onClick={() => setActionMode('decline')} className={d.btn.declineDisabled} disabled={busy}>Decline</button>
              </div>
            ) : null}
            {actionMode === 'accept' ? (
              <div className={d.monitoring.actionBox}>
                <p className={d.monitoring.assignNote}>Accept this backup request from Barangay {selectedBackup.barangay_name || '-'}?</p>
                <p className={d.monitoring.assignNote}><strong>User notes:</strong> {assignmentPreview?.reportNotes || selectedBackup.report_notes || 'No notes provided.'}</p>
                <p className={d.monitoring.assignNote}><strong>Barangay notes:</strong> {assignmentPreview?.barangayNotes || selectedBackup.barangay_notes || 'No additional Barangay notes.'}</p>
                <p className={d.monitoring.assignNote}><strong>Assigned CDRRMD Rescuer:</strong> {previewLoading ? 'Finding nearest available rescuer…' : assignmentPreview?.rescuer ? `${assignmentPreview.rescuer.rescuerName} (${assignmentPreview.rescuer.rescuerAccountId})${assignmentPreview.rescuer.distanceKm != null ? ` · ${assignmentPreview.rescuer.distanceKm.toFixed(2)} km away` : ''}` : 'No available CDRRMD Rescuer'}</p>
                <div className={d.monitoring.actionRow}>
                  <button onClick={() => void validateBackupRequest('accepted')} className={d.btn.acceptDisabled} disabled={busy || previewLoading || !assignmentPreview?.rescuer}>Confirm Accept</button>
                  <button onClick={() => { setActionMode(null); setAssignmentPreview(null); }} className={d.btn.secondaryXs} disabled={busy}>Cancel</button>
                </div>
              </div>
            ) : null}
            {actionMode === 'decline' ? (
              <div className={d.monitoring.actionBox}>
                <textarea value={declineExplanation} onChange={(event) => setDeclineExplanation(event.target.value)} placeholder="Explain why this backup request is declined" className={d.form.textareaSm} />
                <div className={d.monitoring.actionRow}>
                  <button onClick={() => void validateBackupRequest('declined')} className={d.btn.declineDisabled} disabled={busy}>Confirm Decline</button>
                  <button onClick={() => setActionMode(null)} className={d.btn.secondaryXs} disabled={busy}>Cancel</button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </>
  );

  return (
    <AdminShell
      activeView="monitoring"
      title="Incident Monitoring"
      subtitle="Citywide incident response, backup requests, and live operations"
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
      actions={<><button type="button" onClick={() => setShowIncidentHistory(true)} className={d.btn.secondary}>Incident History</button><button onClick={onOpenEvacuationAreas} className={d.monitoring.actionEvac}>Evacuation Readiness</button></>}
    >
      <div className={`${d.monitoring.root} admin-incident-monitoring-root`}>
        {error ? <div className={d.page.error}>{error}</div> : null}

        <section className={d.monitoring.statsGrid}>
          <article className={[d.monitoring.statCardBase, d.monitoring.statReports].join(' ')}><p className={d.monitoring.statLabel}>Reports Today</p><p className={d.monitoring.statValue}>{stats.totalReportsToday}</p></article>
          <article className={[d.monitoring.statCardBase, d.monitoring.statPending].join(' ')}><p className={d.monitoring.statLabel}>{formatIncidentStatus('pending')}</p><p className={d.monitoring.statValue}>{stats.pending}</p></article>
          <article className={[d.monitoring.statCardBase, d.monitoring.statInProgress].join(' ')}><p className={d.monitoring.statLabel}>{formatIncidentStatus('in_progress')}</p><p className={d.monitoring.statValue}>{stats.inProgress}</p></article>
          <article className={[d.monitoring.statCardBase, d.monitoring.statResolved].join(' ')}><p className={d.monitoring.statLabel}>{formatIncidentStatus('resolved')}</p><p className={d.monitoring.statValue}>{stats.resolved}</p></article>
        </section>

        {/* Map + rainfall/selected-incident side panel */}
        <section className={d.monitoring.mainGrid}>
          <article
            ref={mapWrapRef}
            className={d.monitoring.mapCard}
            style={isMapFullscreen ? { position: 'fixed', inset: 0, zIndex: 9999, borderRadius: 0, minHeight: '100dvh', display: 'flex', flexDirection: 'column' } : { position: 'relative' }}
          >
            <iframe ref={mapFrameRef} onLoad={() => { setMapReady(true); postMapUpdate(Boolean(focusKey)); }} title="Monitoring map" srcDoc={mapHtml} className={d.monitoring.mapFrame} />
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
            <section className={d.monitoring.rainRankCard}>
              <div className={d.monitoring.rainRankHead}>
                <div>
                  <h3 className={d.monitoring.rainRankTitle}>Barangays with Moderate–Severe Rainfall</h3>
                  <p className={d.monitoring.rainRankUpdated}>
                    Updated: {rainLegendUpdatedAt ? new Date(rainLegendUpdatedAt).toLocaleTimeString() : '-'}
                  </p>
                </div>
                <button type="button" onClick={() => setShowRainRanking((current) => !current)} className={d.btn.secondaryXs}>
                  {showRainRanking ? 'Hide' : 'Show'}
                </button>
              </div>
              {showRainRanking ? (
                <div className={d.monitoring.rainRankPopover}>
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
                </div>
              ) : null}
            </section>

            {selectedReport ? (
            <article className={d.monitoring.selectedCard} style={{ overflowY: 'auto', minWidth: 0 }}>
              {backupValidationContent}
            </article>
            ) : null}
          </aside>
        </section>

        <section className={d.monitoring.lowerGrid}>
          <article className={d.monitoring.incidentsCard}>
            <div className={d.monitoring.incidentsHead}>
              <h3 className={d.monitoring.incidentsTitle}>Barangay Backup Requests</h3>
              <div className={d.monitoring.filterWrap}>
                {INCIDENT_STATUS_FILTERS.map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={[d.monitoring.filterBase, statusFilter === status ? d.monitoring.filterActive : d.monitoring.filterIdle].join(' ')}
                  >
                    {formatIncidentStatus(status)}
                  </button>
                ))}
              </div>
            </div>
            <div className={d.monitoring.incidentsTableWrap}>
              <table className={d.monitoring.incidentReportsTable}>
                <thead>
                  <tr>
                    <th>Incident ID</th><th>Location</th><th>Status</th><th>Team</th><th>Proof</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReports.length === 0 ? (
                    <tr><td colSpan={5} className={d.table.empty}>No barangay backup requests yet.</td></tr>
                  ) : filteredReports.map((item) => {
                    const itemBackup = backupRequests.find((request) => request.report_id === item.id);
                    const backupIsPending = Boolean(itemBackup && !itemBackup.acknowledged_at);
                    return (
                      <tr
                        key={item.id}
                        onClick={() => {
                          setSelectedReportId(item.id);
                          setMapFocusedReportId(null);
                          setMapFocusMode(null);
                        }}
                        className={[d.monitoring.rowBase, selectedReport?.id === item.id ? d.monitoring.rowSelected : null].filter(Boolean).join(' ')}
                      >
                      <td>
                        {backupIsPending ? (
                          <button
                            type="button"
                            className="rounded bg-amber-100 px-2 py-1 font-extrabold text-amber-800 underline decoration-amber-500 underline-offset-2 hover:bg-amber-200"
                            title="Open pending backup request"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedReportId(item.id);
                              onOpenBackupRequest(item.id);
                            }}
                          >
                            {item.report_code || `RPT-${String(item.id).padStart(6, '0')}`}
                          </button>
                        ) : item.report_code || `RPT-${String(item.id).padStart(6, '0')}`}
                      </td>
                      <td className={d.monitoring.rowLocation}>
                        <button
                          type="button"
                          title={`Show ${item.location} on the map`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedReportId(item.id);
                            setMapFocusedReportId(item.id);
                            setMapFocusMode('location');
                          }}
                          className="block w-full truncate text-left font-semibold text-[#1f567d] hover:underline"
                        >
                          {item.location}
                        </button>
                      </td>
                      <td><span className={`${d.monitoring.statusChip} ${backupIsPending ? '!bg-amber-100 !text-amber-800' : ''}`}>{backupIsPending ? 'Pending' : formatIncidentStatus(item.status, Boolean(item.picked_up_at))}</span></td>
                      <td>{item.assigned_team || '-'}</td>
                      <td>
                        {item.image_base64 ? (
                          <button onClick={(event) => { event.stopPropagation(); setPreviewImage(item.image_base64 || null); }} className={d.btn.secondaryXs}>View</button>
                        ) : <span className={d.monitoring.muted}>-</span>}
                      </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>

          <article className={d.monitoring.validationCard}>
            {incidentDetailContent}
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
        <IncidentHistoryModal open={showIncidentHistory} scopeLabel="the CDRRMD administrator" onClose={() => setShowIncidentHistory(false)} onAuthError={onAuthError} />
      </div>
    </AdminShell>
  );
}
