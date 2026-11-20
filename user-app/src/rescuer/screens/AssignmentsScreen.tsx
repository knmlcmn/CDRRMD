import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppText as Text } from '../../components/Typography';
import PlatformMap from '../../components/PlatformMap';
import { api } from '../../services/api';
import { fetchRoadRoute } from '../../services/routingService';
import { shouldRefreshRoute, type PreviousRouteRefresh } from '../../services/routeRefreshPolicy';
import type { EvacuationAreaItem } from '../../types';
import { buildCalambaMapHtml } from '../utils/rescuerMapHtml';
import { Card, DetailRow, EmptyState, ErrorMessage, PrimaryButton, RescuerScreen, rescuerColors } from '../components/RescuerScreen';
import { acknowledgeAssignment, loadAssignments, loadWeeklyHistory } from '../services/rescuerService';
import type { Assignment, AssignmentHistory, Coordinate, ResponderRole } from '../types';
import {
  createAssignmentScreenRequestScope,
  shouldRefreshAssignmentHistory,
} from '../utils/assignmentHistoryPolicy';
import { retainLastMapLocation } from '../utils/responderMapState';

type Props = {
  role: ResponderRole;
  onAuthError: () => void;
  location: Coordinate | null;
  locationError: string;
  presenceNotice: string;
  presenceRevision: number;
};
type RouteData = { routeCoordinates: Coordinate[]; distanceKm: number | null; etaMinutes: number | null };
type RouteRequest = { controller: AbortController };

const EMPTY_ROUTE: RouteData = { routeCoordinates: [], distanceKm: null, etaMinutes: null };

function errorMessage(error: any, fallback: string) {
  return error?.response?.data?.message || error?.message || fallback;
}

function phase(item: Assignment) {
  if (!item.responder_acknowledged_at) return 'Ready to dispatch';
  return item.picked_up_at ? 'Evacuation' : 'Response';
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function sameRecords<T>(current: T[], next: T[]) {
  return JSON.stringify(current) === JSON.stringify(next);
}

export default function AssignmentsScreen({
  role,
  onAuthError,
  location,
  locationError,
  presenceNotice,
  presenceRevision,
}: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [history, setHistory] = useState<AssignmentHistory[]>([]);
  const [areas, setAreas] = useState<EvacuationAreaItem[]>([]);
  const [areasLoaded, setAreasLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [route, setRoute] = useState<RouteData>({ routeCoordinates: [], distanceKm: null, etaMinutes: null });
  const [alertRoute, setAlertRoute] = useState<RouteData>({ routeCoordinates: [], distanceKm: null, etaMinutes: null });
  const [recenterRequestId, setRecenterRequestId] = useState(0);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [forecastOverlayVisible, setForecastOverlayVisible] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dismissedAlertId, setDismissedAlertId] = useState<number | null>(null);
  const activeRequestRef = useRef<Promise<void> | null>(null);
  const historyRequestRef = useRef<Promise<void> | null>(null);
  const activeRefreshQueuedRef = useRef(false);
  const historyRefreshQueuedRef = useRef(false);
  const activeSnapshotRef = useRef<Assignment[] | null>(null);
  const [requestScope] = useState(() => createAssignmentScreenRequestScope());
  const initialLocationFocusedRef = useRef(false);
  const lastFocusedAssignmentRef = useRef('');
  const retainedMapLocationRef = useRef<Coordinate | null>(null);
  const initialMapLocationRef = useRef<Coordinate | null>(null);
  const routeRefreshRef = useRef<PreviousRouteRefresh | null>(null);
  const routeRequestRef = useRef<RouteRequest | null>(null);
  const alertRouteRefreshRef = useRef<PreviousRouteRefresh | null>(null);
  const alertRouteRequestRef = useRef<RouteRequest | null>(null);
  retainedMapLocationRef.current = retainLastMapLocation(retainedMapLocationRef.current, location);
  const mapLocation = retainedMapLocationRef.current;
  if (!initialMapLocationRef.current && mapLocation) initialMapLocationRef.current = mapLocation;
  const initialMapLocation = initialMapLocationRef.current;
  const mapBaseUrl = String(api.defaults.baseURL || 'http://localhost:4000/api').replace(/\/$/, '');

  const handleApiError = useCallback((caught: any, fallback: string) => {
    if (caught?.response?.status === 401) onAuthError();
    else setError(errorMessage(caught, fallback));
  }, [onAuthError]);

  const refreshHistory = useCallback((ensureAfterCurrent = false): Promise<void> => {
    if (AppState.currentState !== 'active') return Promise.resolve();
    if (historyRequestRef.current) {
      if (ensureAfterCurrent) historyRefreshQueuedRef.current = true;
      return historyRequestRef.current;
    }
    const generation = requestScope.capture();
    const request = loadWeeklyHistory()
      .then((weekly) => {
        if (!requestScope.isCurrent(generation)) return;
        setHistory((current) => sameRecords(current, weekly) ? current : weekly);
      })
      .catch((caught) => {
        if (requestScope.isCurrent(generation)) {
          handleApiError(caught, 'Failed to load this week\'s assignment history.');
        }
      })
      .finally(() => {
        if (historyRequestRef.current === request) historyRequestRef.current = null;
        if (historyRefreshQueuedRef.current) {
          historyRefreshQueuedRef.current = false;
          if (requestScope.isCurrent(generation)) void refreshHistory();
        }
      });
    historyRequestRef.current = request;
    return request;
  }, [handleApiError, requestScope]);

  const refreshActive = useCallback((ensureAfterCurrent = false): Promise<void> => {
    if (AppState.currentState !== 'active') return Promise.resolve();
    if (activeRequestRef.current) {
      if (ensureAfterCurrent) activeRefreshQueuedRef.current = true;
      return activeRequestRef.current;
    }
    const generation = requestScope.capture();
    const request = loadAssignments()
      .then((active) => {
        if (!requestScope.isCurrent(generation)) return;
        const historyChanged = shouldRefreshAssignmentHistory(activeSnapshotRef.current, active);
        activeSnapshotRef.current = active;
        setAssignments((current) => sameRecords(current, active) ? current : active);
        setSelectedId((current) => active.some((item) => item.backup_request_id === current) ? current : active[0]?.backup_request_id ?? null);
        setError('');
        if (historyChanged) void refreshHistory(true);
      })
      .catch((caught) => {
        if (requestScope.isCurrent(generation)) {
          handleApiError(caught, 'Failed to load assigned incidents.');
        }
      })
      .finally(() => {
        if (activeRequestRef.current === request) activeRequestRef.current = null;
        if (requestScope.isCurrent(generation)) setLoading(false);
        if (activeRefreshQueuedRef.current) {
          activeRefreshQueuedRef.current = false;
          if (requestScope.isCurrent(generation)) void refreshActive();
        }
      });
    activeRequestRef.current = request;
    return request;
  }, [handleApiError, refreshHistory, requestScope]);

  const refreshAll = useCallback(async (ensureAfterCurrent = false) => {
    if (AppState.currentState !== 'active') return;
    await Promise.all([
      refreshActive(ensureAfterCurrent),
      refreshHistory(ensureAfterCurrent),
    ]);
  }, [refreshActive, refreshHistory]);

  useEffect(() => {
    requestScope.activate();
    setLoading(true);
    void refreshAll(true);
    const timer = setInterval(() => void refreshActive(), 5000);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshAll(true);
    });
    return () => {
      requestScope.invalidate();
      activeRefreshQueuedRef.current = false;
      historyRefreshQueuedRef.current = false;
      clearInterval(timer);
      appStateSubscription.remove();
    };
  }, [refreshActive, refreshAll, requestScope]);

  useEffect(() => {
    api.get<EvacuationAreaItem[]>('/content/evacuation-areas')
      .then(({ data }) => setAreas(Array.isArray(data) ? data : []))
      .catch((caught) => handleApiError(caught, 'Failed to load evacuation areas.'))
      .finally(() => setAreasLoaded(true));
  }, [handleApiError]);

  useEffect(() => {
    if (presenceRevision > 0) void refreshAll(true);
  }, [presenceRevision, refreshAll]);

  const selected = useMemo(
    () => assignments.find((item) => item.backup_request_id === selectedId) || assignments[0] || null,
    [assignments, selectedId],
  );
  const destination = useMemo<Coordinate | null>(() => {
    if (!selected) return null;
    const latitude = Number(selected.picked_up_at ? selected.evacuation_latitude : selected.latitude);
    const longitude = Number(selected.picked_up_at ? selected.evacuation_longitude : selected.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  }, [selected]);

  const routeRefreshKey = selected && destination
    ? [
        selected.backup_request_id,
        Boolean(selected.responder_acknowledged_at),
        Boolean(selected.picked_up_at),
        destination.latitude,
        destination.longitude,
      ].join(':')
    : '';

  useEffect(() => {
    if (!destination) {
      routeRequestRef.current?.controller.abort();
      routeRequestRef.current = null;
      routeRefreshRef.current = null;
      setRoute((current) => current === EMPTY_ROUTE ? current : EMPTY_ROUTE);
      return;
    }
    // A stationary Android device can briefly report no fresh GPS sample while
    // the presence hook reacquires one. Retain the last route and mounted map;
    // dispatch remains disabled until a fresh location is available again.
    if (!location) return;
    const previous = routeRefreshRef.current;
    const refreshNow = Date.now();
    if (!shouldRefreshRoute({ previous, key: routeRefreshKey, location, now: refreshNow })) return;

    const keyChanged = previous?.key !== routeRefreshKey;
    routeRefreshRef.current = { key: routeRefreshKey, location, refreshedAt: refreshNow };
    routeRequestRef.current?.controller.abort();
    const controller = new AbortController();
    routeRequestRef.current = { controller };
    if (keyChanged) setRoute(EMPTY_ROUTE);

    fetchRoadRoute(location, destination, true, 1, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && routeRequestRef.current?.controller === controller) setRoute(result);
      })
      .catch((caught: any) => {
        if (controller.signal.aborted || caught?.name === 'AbortError') return;
        if (routeRequestRef.current?.controller !== controller) return;
        setRoute((current) => current.routeCoordinates.length > 1
          ? current
          : { routeCoordinates: [location, destination], distanceKm: null, etaMinutes: null });
      });
  }, [destination, location, routeRefreshKey]);

  const buildAssignmentMapHtml = useCallback((fullscreen: boolean) => buildCalambaMapHtml(
    areas,
    initialMapLocation,
    [],
    null,
    null,
    [],
    `${String(api.defaults.baseURL).replace(/\/$/, '')}/flood-risk/calamba/barangays`,
    `${String(api.defaults.baseURL).replace(/\/$/, '')}/flood-risk/calamba/raster`,
    `${String(api.defaults.baseURL).replace(/\/$/, '')}/flood-risk/calamba/rain-impact`,
    `${String(api.defaults.baseURL).replace(/\/$/, '')}/weather/wind-field`,
    {
      boundary: true,
      floodHazard: true,
      evacuationAreas: true,
      incidentMarkers: true,
      responderRoute: true,
      weatherOverlay: false,
      temperatureOverlay: false,
      humidityOverlay: false,
      windOverlay: false,
    },
    role === 'barangay_rescuer' ? 'Your live Barangay Rescuer location' : 'Your live CDRRMD Rescuer location',
    {
      focusOnResponder: true,
      allowLiveRouteUpdates: true,
      responderKind: role === 'barangay_rescuer' ? 'barangay' : 'cddrmd',
      showForecastTimeline: fullscreen,
      showForecastLayers: true,
      forecastTimelinePosition: 'bottom-right',
      showRecenterControl: true,
      sensorRefreshIntervalMs: 5000,
    },
  ), [areas, initialMapLocation, role]);

  const mapHtml = useMemo(() => buildAssignmentMapHtml(false), [buildAssignmentMapHtml]);
  const fullscreenMapHtml = useMemo(() => mapFullscreen ? buildAssignmentMapHtml(true) : '', [buildAssignmentMapHtml, mapFullscreen]);

  const handleFullscreenMapMessage = useCallback((message: string) => {
    try {
      const event = JSON.parse(message);
      if (event?.type === 'forecast-overlay-visibility') {
        setForecastOverlayVisible(Boolean(event.visible));
      }
    } catch {
      // Ignore unrelated WebView messages.
    }
  }, []);

  const closeFullscreenMap = useCallback(() => {
    setMapFullscreen(false);
    setForecastOverlayVisible(false);
  }, []);

  const incidentPoints = useMemo(() => assignments.map((item) => ({
    reportCode: item.report_code,
    latitude: Number(item.latitude),
    longitude: Number(item.longitude),
    status: item.status,
    reportType: 'rescue',
  })).filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)), [assignments]);

  const mapUpdate = useMemo(() => ({
    type: 'rescue-map-update',
    responderLocation: mapLocation,
    routeCoordinates: route.routeCoordinates,
    incidentLocation: selected?.picked_up_at ? null : destination,
    selectedReportCode: selected?.report_code || null,
    incidentPoints,
    pickedUp: Boolean(selected?.picked_up_at),
    responderHeading: null,
    responderKind: role === 'barangay_rescuer' ? 'barangay' : 'cddrmd',
    routeDestination: selected?.picked_up_at ? destination : null,
    evacuationAreaName: selected?.evacuation_area_name || null,
    recenterRequestId,
  }), [destination, incidentPoints, mapLocation, recenterRequestId, role, route.routeCoordinates, selected]);

  const newAssignment = useMemo(
    () => assignments.find((item) => !item.responder_acknowledged_at && item.backup_request_id !== dismissedAlertId) || null,
    [assignments, dismissedAlertId],
  );
  const alertDestination = useMemo<Coordinate | null>(() => {
    if (!newAssignment) return null;
    const latitude = Number(newAssignment.reported_latitude ?? newAssignment.latitude);
    const longitude = Number(newAssignment.reported_longitude ?? newAssignment.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  }, [newAssignment]);

  const alertRouteRefreshKey = newAssignment && alertDestination
    ? `${newAssignment.backup_request_id}:${alertDestination.latitude}:${alertDestination.longitude}`
    : '';

  useEffect(() => {
    if (!alertDestination) {
      alertRouteRequestRef.current?.controller.abort();
      alertRouteRequestRef.current = null;
      alertRouteRefreshRef.current = null;
      setAlertRoute((current) => current === EMPTY_ROUTE ? current : EMPTY_ROUTE);
      return;
    }
    if (!location) return;
    const previous = alertRouteRefreshRef.current;
    const refreshNow = Date.now();
    if (!shouldRefreshRoute({ previous, key: alertRouteRefreshKey, location, now: refreshNow })) return;

    const keyChanged = previous?.key !== alertRouteRefreshKey;
    alertRouteRefreshRef.current = { key: alertRouteRefreshKey, location, refreshedAt: refreshNow };
    alertRouteRequestRef.current?.controller.abort();
    const controller = new AbortController();
    alertRouteRequestRef.current = { controller };
    if (keyChanged) setAlertRoute(EMPTY_ROUTE);

    fetchRoadRoute(location, alertDestination, true, 1, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && alertRouteRequestRef.current?.controller === controller) setAlertRoute(result);
      })
      .catch((caught: any) => {
        if (controller.signal.aborted || caught?.name === 'AbortError') return;
        if (alertRouteRequestRef.current?.controller !== controller) return;
        setAlertRoute((current) => current.routeCoordinates.length > 1
          ? current
          : { routeCoordinates: [location, alertDestination], distanceKm: null, etaMinutes: null });
      });
  }, [alertDestination, alertRouteRefreshKey, location]);

  useEffect(() => () => {
    routeRequestRef.current?.controller.abort();
    alertRouteRequestRef.current?.controller.abort();
  }, []);

  const focusKey = selected ? `${selected.backup_request_id}:${Boolean(selected.responder_acknowledged_at)}:${Boolean(selected.picked_up_at)}:${selected.evacuation_area_id || ''}` : '';
  useEffect(() => {
    if (!location) return;
    if (!initialLocationFocusedRef.current) {
      initialLocationFocusedRef.current = true;
      lastFocusedAssignmentRef.current = focusKey;
      setRecenterRequestId(Date.now());
      return;
    }
    if (focusKey && focusKey !== lastFocusedAssignmentRef.current) {
      lastFocusedAssignmentRef.current = focusKey;
      setRecenterRequestId(Date.now());
    }
    if (!focusKey) lastFocusedAssignmentRef.current = '';
  }, [focusKey, location]);

  const alertMapHtml = useMemo(() => buildCalambaMapHtml(
    [], initialMapLocation, [], alertDestination,
    newAssignment?.report_code || null,
    alertDestination && newAssignment ? [{ reportCode: newAssignment.report_code, ...alertDestination, status: 'pending', reportType: 'rescue' }] : [],
    `${String(api.defaults.baseURL).replace(/\/$/, '')}/flood-risk/calamba/barangays`,
    `${String(api.defaults.baseURL).replace(/\/$/, '')}/flood-risk/calamba/raster`,
    `${String(api.defaults.baseURL).replace(/\/$/, '')}/flood-risk/calamba/rain-impact`,
    `${String(api.defaults.baseURL).replace(/\/$/, '')}/weather/wind-field`,
    { boundary: false, floodHazard: false, evacuationAreas: false, incidentMarkers: true, responderRoute: true, weatherOverlay: false, temperatureOverlay: false, humidityOverlay: false, windOverlay: false },
    role === 'barangay_rescuer' ? 'Your live Barangay Rescuer location' : 'Your live CDRRMD Rescuer location',
    {
      focusOnResponder: true,
      allowLiveRouteUpdates: true,
      responderKind: role === 'barangay_rescuer' ? 'barangay' : 'cddrmd',
      showForecastTimeline: false,
      showForecastLayers: false,
    },
  ), [alertDestination, initialMapLocation, newAssignment, role]);

  const alertMapUpdate = useMemo(() => newAssignment ? ({
    type: 'rescue-map-update',
    responderLocation: mapLocation,
    routeCoordinates: alertRoute.routeCoordinates,
    incidentLocation: alertDestination,
    selectedReportCode: newAssignment.report_code,
    incidentPoints: alertDestination
      ? [{ reportCode: newAssignment.report_code, ...alertDestination, status: 'pending', reportType: 'rescue' }]
      : [],
    pickedUp: false,
    responderKind: role === 'barangay_rescuer' ? 'barangay' : 'cddrmd',
  }) : null, [alertDestination, alertRoute.routeCoordinates, mapLocation, newAssignment, role]);

  async function dispatch(item: Assignment) {
    if (busy || !location) return;
    setBusy(true);
    try {
      await acknowledgeAssignment(item.backup_request_id);
      setDismissedAlertId(null);
      await refreshAll(true);
    } catch (caught) {
      handleApiError(caught, 'Unable to confirm this rescue dispatch.');
    } finally {
      setBusy(false);
    }
  }

  const subtitle = role === 'barangay_rescuer' ? 'Barangay incidents and live routing' : 'CDRRMD backup incidents and live routing';
  return (
    <RescuerScreen title={role === 'barangay_rescuer' ? 'Barangay Rescue Assignments' : 'CDRRMD Backup Assignments'} subtitle={subtitle} refreshing={loading} onRefresh={() => { setLoading(true); void refreshAll(true); }}>
      <ErrorMessage message={error} />
      {presenceNotice ? <Text style={styles.notice}>{presenceNotice}</Text> : null}
      <View style={styles.statusStrip}>
        <View style={styles.statusItem}><View style={[styles.statusDot, location ? styles.statusOnline : styles.statusWaiting]} /><View style={styles.statusText}><Text style={styles.statusLabel}>LIVE LOCATION</Text><Text numberOfLines={2} style={[styles.statusValue, locationError ? styles.statusError : null]}>{location ? 'Connected' : locationError || 'Acquiring GPS'}</Text></View></View>
        <View style={styles.statusDivider} />
        <View style={styles.statusItem}><MaterialCommunityIcons name="radio-tower" size={20} color={rescuerColors.blue} /><View><Text style={styles.statusLabel}>ASSIGNMENTS</Text><Text style={styles.statusValue}>{assignments.length} active</Text></View></View>
      </View>
      <View style={styles.mapCard}>
        {!mapFullscreen && areasLoaded && mapLocation ? <PlatformMap
          html={mapHtml}
          baseUrl={mapBaseUrl}
          preserveState
          updateMessage={mapUpdate}
        /> : mapFullscreen ? <View style={styles.mapPlaceholder} /> : <EmptyState loading message={areasLoaded ? 'Waiting for your current location…' : 'Loading rescue map…'} />}
        <TouchableOpacity accessibilityLabel="Open map full screen" onPress={() => { setForecastOverlayVisible(false); setMapFullscreen(true); }} style={styles.fullscreenButton}>
          <MaterialCommunityIcons name="fullscreen" size={22} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <Card>
        <Text style={styles.sectionTitle}>Assigned Incidents</Text>
        <Text style={styles.hint}>{assignments.length} active assignment{assignments.length === 1 ? '' : 's'}</Text>
        {!assignments.length ? <EmptyState loading={loading} message="No active incident assigned." /> : assignments.map((item) => (
          <TouchableOpacity key={item.backup_request_id} onPress={() => setSelectedId(item.backup_request_id)} style={[styles.assignment, selected?.backup_request_id === item.backup_request_id && styles.assignmentSelected]}>
            <View style={styles.assignmentText}><Text style={styles.assignmentCode}>{item.report_code}</Text><Text style={styles.assignmentMeta}>{item.assigned_barangay} · {item.incident_type.replace(/_/g, ' ')}</Text></View>
            <Text style={styles.phase}>{phase(item)}</Text>
          </TouchableOpacity>
        ))}
      </Card>

      {selected ? <Card>
        <Text style={styles.sectionTitle}>{selected.report_code}</Text>
        {selected.outside_normal_service_area ? <Text style={styles.outsideAreaWarning}>OUTSIDE NORMAL SERVICE AREA — real dispatch to the reported GPS. Response conditions require operational judgment.</Text> : null}
        <DetailRow label="Status" value={phase(selected)} />
        <DetailRow label="Resident" value={selected.reporter_name || '-'} />
        <DetailRow label="Contact" value={selected.reporter_contact || '-'} />
        <DetailRow label="People" value={String(selected.estimated_people ?? selected.evacuees_reserved ?? 1)} />
        <DetailRow label="Incident" value={selected.incident_type.replace(/_/g, ' ')} />
        <DetailRow label="Location" value={selected.location} />
        <DetailRow label="Destination" value={selected.picked_up_at ? selected.evacuation_area_name || 'Nearest available center' : 'Resident pinned location'} />
        <Text style={styles.suitabilityAdvisory}>The assigned center has capacity and a road-reachable route. Hazard clearance and incident-specific suitability data are not available; follow Barangay operational guidance.</Text>
        <DetailRow label="Distance" value={route.distanceKm == null ? 'Calculating…' : `${route.distanceKm.toFixed(2)} km`} />
        <DetailRow label="ETA" value={route.etaMinutes == null ? 'Calculating…' : `${route.etaMinutes} minutes`} />
        <Text style={styles.instructions}>{!selected.responder_acknowledged_at ? 'Review the route, then dispatch when ready.' : selected.picked_up_at ? `Follow the route to ${selected.evacuation_area_name || 'the assigned evacuation center'}. Evacuation personnel will confirm arrival.` : 'Follow the route to the resident. The server may infer pickup only after multiple fresh, accurate, sustained proximity observations; GPS alone cannot prove physical pickup.'}</Text>
        {!selected.responder_acknowledged_at ? <PrimaryButton disabled={busy || !location} label={busy ? 'Dispatching…' : location ? 'Dispatch' : 'Waiting for GPS…'} onPress={() => void dispatch(selected)} /> : null}
      </Card> : null}

      <Card>
        <Text style={styles.sectionTitle}>This Week's Assignment History</Text>
        {!history.length ? <EmptyState message="No completed assignments this week." /> : history.map((item) => (
          <View key={item.backup_request_id} style={styles.historyItem}>
            <Text style={styles.assignmentCode}>{item.report_code}</Text>
            <Text style={styles.assignmentMeta}>{item.reporter_name || '-'} · {item.assigned_barangay}</Text>
            <Text style={styles.hint}>{item.evacuation_area_name || '-'} · {formatDate(item.arrived_at)}</Text>
          </View>
        ))}
      </Card>

      <Modal visible={mapFullscreen} animationType="fade" statusBarTranslucent onRequestClose={closeFullscreenMap}>
        <View style={styles.fullscreenMap}>
          {mapFullscreen && areasLoaded && mapLocation ? <PlatformMap html={fullscreenMapHtml} baseUrl={mapBaseUrl} preserveState updateMessage={mapUpdate} onMessage={handleFullscreenMapMessage} /> : <EmptyState loading message={areasLoaded ? 'Waiting for your current location…' : 'Loading rescue map…'} />}
          <TouchableOpacity accessibilityLabel="Close full-screen map" onPress={closeFullscreenMap} style={[styles.fullscreenClose, forecastOverlayVisible && styles.fullscreenCloseRaised]}>
            <MaterialCommunityIcons name="fullscreen-exit" size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal visible={Boolean(newAssignment)} transparent animationType="slide" onRequestClose={() => setDismissedAlertId(newAssignment?.backup_request_id || null)}>
        <View style={styles.modalBackdrop}><View style={styles.modalCard}><ScrollView contentContainerStyle={styles.modalScroll}>
          <Text style={styles.alertLabel}>NEW {role === 'barangay_rescuer' ? 'BARANGAY' : 'CDRRMD'} ASSIGNMENT</Text>
          <Text style={styles.modalTitle}>{newAssignment?.reporter_name || 'Resident Rescue Request'}</Text>
          {newAssignment ? <>
            <Text style={styles.modalIncident}>{newAssignment.incident_type.replace(/_/g, ' ')}</Text>
            <DetailRow label="Incident" value={newAssignment.incident_type.replace(/_/g, ' ')} />
            <DetailRow label="Contact" value={newAssignment.reporter_contact || 'Not provided'} />
            <DetailRow label="People" value={String(newAssignment.estimated_people ?? newAssignment.evacuees_reserved ?? 1)} />
            <DetailRow label="Location" value={newAssignment.location} />
            {alertDestination ? <DetailRow label="Coordinates" value={`${alertDestination.latitude.toFixed(6)}, ${alertDestination.longitude.toFixed(6)}`} /> : null}
            <DetailRow label="Barangay" value={newAssignment.assigned_barangay} />
            <DetailRow label="Evacuation" value={newAssignment.evacuation_area_name || 'Nearest available center'} />
            <DetailRow label="Shortest route" value={alertRoute.distanceKm != null && alertRoute.etaMinutes != null ? `${alertRoute.distanceKm.toFixed(2)} km · about ${alertRoute.etaMinutes} min` : 'Calculating…'} />
            {mapLocation && alertDestination ? <View style={styles.alertMap}><PlatformMap key={newAssignment.backup_request_id} html={alertMapHtml} baseUrl={mapBaseUrl} preserveState updateMessage={alertMapUpdate} /></View> : <View style={styles.alertMap}><EmptyState loading message="Waiting for GPS…" /></View>}
            <Text style={styles.modalCode}>{newAssignment.report_code}</Text>
            <View style={styles.modalActions}>
              <PrimaryButton disabled={busy || !location} label={busy ? 'Confirming…' : location ? 'Confirm Dispatch' : 'Waiting for GPS…'} onPress={() => void dispatch(newAssignment)} />
              <TouchableOpacity onPress={() => setDismissedAlertId(newAssignment.backup_request_id)} style={styles.standby}><Text style={styles.standbyText}>Standby Request</Text></TouchableOpacity>
            </View>
          </> : null}
        </ScrollView></View></View>
      </Modal>
    </RescuerScreen>
  );
}

const styles = StyleSheet.create({
  statusStrip: { height: 68, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: rescuerColors.border, backgroundColor: '#fff', shadowColor: '#0b2e4e', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  statusItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  statusText: { flex: 1 },
  statusDivider: { width: 1, height: 32, marginHorizontal: 12, backgroundColor: '#dce7ef' },
  statusDot: { width: 11, height: 11, borderRadius: 6 },
  statusOnline: { backgroundColor: '#10b981' },
  statusWaiting: { backgroundColor: '#f59e0b' },
  statusLabel: { color: rescuerColors.muted, fontSize: 8, lineHeight: 11, fontWeight: '900', letterSpacing: 0.8 },
  statusValue: { color: rescuerColors.ink, fontSize: 12, lineHeight: 16, fontWeight: '900' },
  statusError: { color: rescuerColors.danger, fontSize: 9, lineHeight: 11 },
  mapCard: { height: 370, overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderColor: rescuerColors.border, backgroundColor: '#dbe5eb', shadowColor: '#0b2e4e', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  mapPlaceholder: { flex: 1, backgroundColor: '#dbe5eb' },
  fullscreenButton: { position: 'absolute', right: 12, bottom: 12, width: 42, height: 42, borderRadius: 9, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(18,49,75,0.94)', alignItems: 'center', justifyContent: 'center' },
  fullscreenMap: { flex: 1, backgroundColor: '#0f172a' },
  fullscreenClose: { position: 'absolute', right: 14, bottom: 14, width: 46, height: 46, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)', backgroundColor: 'rgba(18,49,75,0.96)', alignItems: 'center', justifyContent: 'center' },
  fullscreenCloseRaised: { bottom: 110 },
  sectionTitle: { color: rescuerColors.ink, fontSize: 17, fontWeight: '900' },
  hint: { color: rescuerColors.muted, fontSize: 11, marginTop: 2 },
  notice: { padding: 11, borderRadius: 10, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fcd34d', color: '#92400e', fontWeight: '700' },
  assignment: { flexDirection: 'row', alignItems: 'center', marginTop: 9, padding: 12, borderRadius: 12, backgroundColor: '#f8fbfd', borderWidth: 1, borderColor: '#dce7ef' },
  assignmentSelected: { backgroundColor: '#e4f1fa', borderColor: '#72aed3', borderLeftWidth: 4 },
  assignmentText: { flex: 1 },
  assignmentCode: { color: rescuerColors.ink, fontSize: 13, fontWeight: '900' },
  assignmentMeta: { color: '#475569', fontSize: 11, marginTop: 2 },
  phase: { color: '#1d4ed8', fontSize: 10, fontWeight: '900', marginLeft: 8, textAlign: 'right', maxWidth: 100 },
  instructions: { marginVertical: 12, padding: 10, borderRadius: 9, backgroundColor: '#eff6ff', color: '#1e3a8a', fontSize: 11, lineHeight: 16 },
  outsideAreaWarning: { marginTop: 8, padding: 10, borderRadius: 9, backgroundColor: '#fef2f2', color: '#991b1b', fontSize: 11, lineHeight: 16, fontWeight: '800' },
  suitabilityAdvisory: { marginTop: 8, color: '#92400e', fontSize: 10, lineHeight: 15, fontWeight: '700' },
  historyItem: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#cbd5e1' },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 14, backgroundColor: 'rgba(2, 6, 23, 0.68)' },
  modalCard: { width: '100%', maxWidth: 1000, maxHeight: '94%', alignSelf: 'center', overflow: 'hidden', backgroundColor: '#fff', borderRadius: 24, borderTopWidth: 5, borderTopColor: rescuerColors.blue },
  modalScroll: { padding: 20, paddingBottom: 24 },
  alertLabel: { color: rescuerColors.danger, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  modalTitle: { color: rescuerColors.ink, fontSize: 23, lineHeight: 29, fontWeight: '900', marginVertical: 14 },
  modalIncident: { color: rescuerColors.ink, fontSize: 16, fontWeight: '800', marginBottom: 10, textTransform: 'capitalize' },
  alertMap: { height: 280, overflow: 'hidden', marginTop: 16, borderRadius: 12, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#f1f5f9' },
  modalCode: { marginTop: 12, color: '#94a3b8', fontSize: 11, fontWeight: '800' },
  modalActions: { gap: 9, marginTop: 18 },
  standby: { minHeight: 45, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  standbyText: { color: '#475569', fontSize: 14, fontWeight: '900' },
});
