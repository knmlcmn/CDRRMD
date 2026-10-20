import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppText as Text } from '../../components/Typography';
import PlatformMap from '../../components/PlatformMap';
import { api } from '../../services/api';
import { requireLiveLocation } from '../../services/locationAccess';
import { fetchRoadRoute } from '../../services/routingService';
import type { EvacuationAreaItem } from '../../types';
import { buildCalambaMapHtml } from '../utils/rescuerMapHtml';
import { Card, DetailRow, EmptyState, ErrorMessage, PrimaryButton, RescuerScreen, rescuerColors } from '../components/RescuerScreen';
import { acknowledgeAssignment, loadAssignments, loadWeeklyHistory, sendHeartbeat, updateResponderLocation } from '../services/rescuerService';
import type { Assignment, AssignmentHistory, Coordinate, ResponderRole } from '../types';

type Props = { role: ResponderRole; onAuthError: () => void };
type RouteData = { routeCoordinates: Coordinate[]; distanceKm: number | null; etaMinutes: number | null };

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

export default function AssignmentsScreen({ role, onAuthError }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [history, setHistory] = useState<AssignmentHistory[]>([]);
  const [areas, setAreas] = useState<EvacuationAreaItem[]>([]);
  const [areasLoaded, setAreasLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [location, setLocation] = useState<Coordinate | null>(null);
  const [route, setRoute] = useState<RouteData>({ routeCoordinates: [], distanceKm: null, etaMinutes: null });
  const [alertRoute, setAlertRoute] = useState<RouteData>({ routeCoordinates: [], distanceKm: null, etaMinutes: null });
  const [recenterRequestId, setRecenterRequestId] = useState(0);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [forecastOverlayVisible, setForecastOverlayVisible] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dismissedAlertId, setDismissedAlertId] = useState<number | null>(null);
  const loadingRef = useRef(false);
  const locationRef = useRef<Coordinate | null>(null);
  const initialLocationFocusedRef = useRef(false);
  const lastFocusedAssignmentRef = useRef('');

  const handleApiError = useCallback((caught: any, fallback: string) => {
    if (caught?.response?.status === 401) onAuthError();
    else setError(errorMessage(caught, fallback));
  }, [onAuthError]);

  const refresh = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const [active, weekly] = await Promise.all([loadAssignments(), loadWeeklyHistory()]);
      setAssignments(active);
      setHistory(weekly);
      setSelectedId((current) => active.some((item) => item.backup_request_id === current) ? current : active[0]?.backup_request_id ?? null);
      setError('');
    } catch (caught) {
      handleApiError(caught, 'Failed to load assigned incidents.');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [handleApiError]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    api.get<EvacuationAreaItem[]>('/content/evacuation-areas')
      .then(({ data }) => setAreas(Array.isArray(data) ? data : []))
      .catch((caught) => handleApiError(caught, 'Failed to load evacuation areas.'))
      .finally(() => setAreasLoaded(true));
  }, [handleApiError]);

  useEffect(() => {
    let active = true;
    let locationBusy = false;
    async function updateLocation(requestPermission: boolean) {
      if (locationBusy) return;
      locationBusy = true;
      try {
        const result = await requireLiveLocation(requestPermission);
        if (!active) return;
        if (!result.ok) {
          setError(result.message);
          return;
        }
        locationRef.current = result.location;
        setLocation(result.location);
        const { data } = await updateResponderLocation(result.location.latitude, result.location.longitude);
        if (data.rerouted) setNotice(`Route updated to ${data.evacuationAreaName || 'the nearest available evacuation center'}.`);
        if (data.rerouted || data.pickupConfirmed) void refresh();
      } catch (caught) {
        handleApiError(caught, 'Unable to update your live responder location.');
      } finally {
        locationBusy = false;
      }
    }
    void updateLocation(true);
    const timer = setInterval(() => void updateLocation(false), 3000);
    return () => { active = false; clearInterval(timer); };
  }, [handleApiError, refresh]);

  useEffect(() => {
    let active = true;
    async function heartbeat() {
      if (!active) return;
      try { await sendHeartbeat(); } catch (caught: any) { if (caught?.response?.status === 401) onAuthError(); }
    }
    void heartbeat();
    const timer = setInterval(() => void heartbeat(), 15000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void heartbeat(); });
    return () => { active = false; clearInterval(timer); subscription.remove(); };
  }, [onAuthError]);

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

  useEffect(() => {
    let active = true;
    if (!location || !destination) {
      setRoute({ routeCoordinates: [], distanceKm: null, etaMinutes: null });
      return () => { active = false; };
    }
    fetchRoadRoute(location, destination, true)
      .then((result) => { if (active) setRoute(result); })
      .catch(() => { if (active) setRoute({ routeCoordinates: [location, destination], distanceKm: null, etaMinutes: null }); });
    return () => { active = false; };
  }, [destination, location]);

  const buildAssignmentMapHtml = useCallback((fullscreen: boolean) => buildCalambaMapHtml(
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
    {
      boundary: true,
      floodHazard: !fullscreen,
      evacuationAreas: true,
      incidentMarkers: true,
      responderRoute: true,
      weatherOverlay: fullscreen,
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
    },
  ), [areas, role]);

  const mapHtml = useMemo(() => buildAssignmentMapHtml(false), [buildAssignmentMapHtml]);
  const fullscreenMapHtml = useMemo(() => buildAssignmentMapHtml(true), [buildAssignmentMapHtml]);

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
    responderLocation: location,
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
  }), [destination, incidentPoints, location, recenterRequestId, role, route.routeCoordinates, selected]);

  const newAssignment = assignments.find((item) => !item.responder_acknowledged_at && item.backup_request_id !== dismissedAlertId) || null;
  const alertDestination = useMemo<Coordinate | null>(() => {
    if (!newAssignment) return null;
    const latitude = Number(newAssignment.reported_latitude ?? newAssignment.latitude);
    const longitude = Number(newAssignment.reported_longitude ?? newAssignment.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  }, [newAssignment]);

  useEffect(() => {
    let active = true;
    if (!location || !alertDestination) {
      setAlertRoute({ routeCoordinates: [], distanceKm: null, etaMinutes: null });
      return () => { active = false; };
    }
    fetchRoadRoute(location, alertDestination, true)
      .then((result) => { if (active) setAlertRoute(result); })
      .catch(() => { if (active) setAlertRoute({ routeCoordinates: [location, alertDestination], distanceKm: null, etaMinutes: null }); });
    return () => { active = false; };
  }, [alertDestination, location]);

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
    [], location, alertRoute.routeCoordinates, alertDestination,
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
  ), [alertDestination, alertRoute.routeCoordinates, location, newAssignment, role]);

  async function dispatch(item: Assignment) {
    if (busy || !locationRef.current) return;
    setBusy(true);
    try {
      await acknowledgeAssignment(item.backup_request_id);
      setDismissedAlertId(null);
      await refresh();
    } catch (caught) {
      handleApiError(caught, 'Unable to confirm this rescue dispatch.');
    } finally {
      setBusy(false);
    }
  }

  const subtitle = role === 'barangay_rescuer' ? 'Barangay incidents and live routing' : 'CDRRMD backup incidents and live routing';
  return (
    <RescuerScreen title={role === 'barangay_rescuer' ? 'Barangay Rescue Assignments' : 'CDRRMD Backup Assignments'} subtitle={subtitle} refreshing={loading} onRefresh={() => void refresh()}>
      <ErrorMessage message={error} />
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <View style={styles.mapCard}>
        {areasLoaded ? <PlatformMap
          html={mapHtml}
          preserveState
          updateMessage={mapUpdate}
        /> : <EmptyState loading message="Loading rescue map…" />}
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
        <DetailRow label="Status" value={phase(selected)} />
        <DetailRow label="Resident" value={selected.reporter_name || '-'} />
        <DetailRow label="Contact" value={selected.reporter_contact || '-'} />
        <DetailRow label="People" value={String(selected.estimated_people ?? selected.evacuees_reserved ?? 1)} />
        <DetailRow label="Incident" value={selected.incident_type.replace(/_/g, ' ')} />
        <DetailRow label="Location" value={selected.location} />
        <DetailRow label="Destination" value={selected.picked_up_at ? selected.evacuation_area_name || 'Nearest available center' : 'Resident pinned location'} />
        <DetailRow label="Distance" value={route.distanceKm == null ? 'Calculating…' : `${route.distanceKm.toFixed(2)} km`} />
        <DetailRow label="ETA" value={route.etaMinutes == null ? 'Calculating…' : `${route.etaMinutes} minutes`} />
        <Text style={styles.instructions}>{!selected.responder_acknowledged_at ? 'Review the route, then dispatch when ready.' : selected.picked_up_at ? `Follow the route to ${selected.evacuation_area_name || 'the assigned evacuation center'}. Evacuation personnel will confirm arrival.` : 'Follow the route to the resident. Pickup is confirmed automatically within 50 meters.'}</Text>
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
          {areasLoaded ? <PlatformMap html={fullscreenMapHtml} preserveState updateMessage={mapUpdate} onMessage={handleFullscreenMapMessage} /> : <EmptyState loading message="Loading rescue map…" />}
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
            {location && alertDestination ? <View style={styles.alertMap}><PlatformMap key={newAssignment.backup_request_id} html={alertMapHtml} preserveState updateMessage={{ type: 'rescue-map-update', responderLocation: location, routeCoordinates: alertRoute.routeCoordinates, incidentLocation: alertDestination, selectedReportCode: newAssignment.report_code, incidentPoints: [{ reportCode: newAssignment.report_code, ...alertDestination, status: 'pending', reportType: 'rescue' }], pickedUp: false, responderKind: role === 'barangay_rescuer' ? 'barangay' : 'cddrmd' }} /></View> : <View style={styles.alertMap}><EmptyState loading message="Waiting for GPS…" /></View>}
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
  mapCard: { height: 360, overflow: 'hidden', borderRadius: 14, borderWidth: 1, borderColor: rescuerColors.border, backgroundColor: '#dbe5eb' },
  fullscreenButton: { position: 'absolute', right: 12, bottom: 12, width: 42, height: 42, borderRadius: 9, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(18,49,75,0.94)', alignItems: 'center', justifyContent: 'center' },
  fullscreenMap: { flex: 1, backgroundColor: '#0f172a' },
  fullscreenClose: { position: 'absolute', right: 14, bottom: 14, width: 46, height: 46, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)', backgroundColor: 'rgba(18,49,75,0.96)', alignItems: 'center', justifyContent: 'center' },
  fullscreenCloseRaised: { bottom: 110 },
  sectionTitle: { color: rescuerColors.ink, fontSize: 17, fontWeight: '900' },
  hint: { color: rescuerColors.muted, fontSize: 11, marginTop: 2 },
  notice: { padding: 11, borderRadius: 10, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fcd34d', color: '#92400e', fontWeight: '700' },
  assignment: { flexDirection: 'row', alignItems: 'center', marginTop: 9, padding: 11, borderRadius: 10, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  assignmentSelected: { backgroundColor: '#dbeafe', borderColor: '#93c5fd' },
  assignmentText: { flex: 1 },
  assignmentCode: { color: rescuerColors.ink, fontSize: 13, fontWeight: '900' },
  assignmentMeta: { color: '#475569', fontSize: 11, marginTop: 2 },
  phase: { color: '#1d4ed8', fontSize: 10, fontWeight: '900', marginLeft: 8, textAlign: 'right', maxWidth: 100 },
  instructions: { marginVertical: 12, padding: 10, borderRadius: 9, backgroundColor: '#eff6ff', color: '#1e3a8a', fontSize: 11, lineHeight: 16 },
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
