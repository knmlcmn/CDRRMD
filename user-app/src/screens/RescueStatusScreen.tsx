import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText as Text } from '../components/Typography';
import { DashboardHeader } from '../components/DashboardHeader';
import { editorial } from '../components/EditorialTheme';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { api } from '../services/api';
import { requireLiveLocation } from '../services/locationAccess';
import { fetchRoadRoute } from '../services/routingService';
import PlatformMap from '../components/PlatformMap';
import { buildCalambaMapHtml } from '../utils/calambaMapHtml';
import { useResponsiveLayout } from '../utils/responsive';
import { keepIfEqual } from '../utils/stableData';

type Coordinate = { latitude: number; longitude: number };

type RescueStatus = 'pending' | 'accepted' | 'in_progress' | 'resolved' | 'declined';

type RescueReport = {
  id: number;
  report_code?: string | null;
  status?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at?: string;
  updated_at?: string;
  assigned_team?: string | null;
  decline_explanation?: string | null;
  evacuation_area_id?: number | null;
  evacuation_area_name?: string | null;
  evacuation_latitude?: number | null;
  evacuation_longitude?: number | null;
  picked_up_at?: string | null;
  dispatch_type?: 'barangay_responder' | 'cddrmd_backup' | null;
  rescuer_name?: string | null;
  responder_acknowledged_at?: string | null;
  rescuer_latitude?: number | null;
  rescuer_longitude?: number | null;
  rescuer_location_updated_at?: string | null;
};

type EvacuationArea = {
  id: number;
  name: string;
  barangay: string;
  latitude: number;
  longitude: number;
  capacity: number;
  evacuees: number;
  is_active: boolean;
  created_at: string;
};

function normalizeStatus(value?: string | null): RescueStatus {
  const normalized = String(value || 'pending').toLowerCase();
  if (normalized === 'accepted') {
    return 'accepted';
  }
  if (normalized === 'in_progress') {
    return 'in_progress';
  }
  if (normalized === 'resolved') {
    return 'resolved';
  }
  if (normalized === 'declined') {
    return 'declined';
  }
  return 'pending';
}

function toTitle(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function distanceSquared(a: Coordinate, b: Coordinate) {
  const dLat = a.latitude - b.latitude;
  const dLon = a.longitude - b.longitude;
  return dLat * dLat + dLon * dLon;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export default function RescueStatusScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const reportId = Number(route.params?.reportId || 0);
  const { isSmall, horizontalPadding } = useResponsiveLayout();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<RescueReport | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [evacuationAreas, setEvacuationAreas] = useState<EvacuationArea[]>([]);
  const [routeCoordinates, setRouteCoordinates] = useState<Coordinate[]>([]);
  const [userLocation, setUserLocation] = useState<Coordinate | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locatingUser, setLocatingUser] = useState(false);
  const [recenterRequestId, setRecenterRequestId] = useState(0);
  const hasReportRef = useRef(false);
  const lastRouteKeyRef = useRef('');
  const syncInFlightRef = useRef(false);

  const loadStatus = useCallback(async () => {
    if (!reportId) {
      setError('Invalid rescue report.');
      setLoading(false);
      return;
    }
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;

    try {
      const rows = await api.get('/reports/mine').then((res) => (Array.isArray(res.data) ? res.data : []));
      const selected = rows.find((item: any) => Number(item?.id) === reportId);
      if (!selected) {
        setError('Rescue report not found.');
        if (!hasReportRef.current) setReport(null);
        setLoading(false);
        return;
      }

      const normalized: RescueReport = {
        id: Number(selected.id),
        report_code: selected.report_code || null,
        status: selected.status || 'pending',
        latitude: optionalNumber(selected.latitude),
        longitude: optionalNumber(selected.longitude),
        created_at: selected.created_at,
        updated_at: selected.updated_at,
        assigned_team: selected.assigned_team || null,
        decline_explanation: selected.decline_explanation || null,
        evacuation_area_id: optionalNumber(selected.evacuation_area_id),
        evacuation_area_name: selected.evacuation_area_name || null,
        evacuation_latitude: optionalNumber(selected.evacuation_latitude),
        evacuation_longitude: optionalNumber(selected.evacuation_longitude),
        picked_up_at: selected.picked_up_at || null,
        dispatch_type: selected.dispatch_type || null,
        rescuer_name: selected.rescuer_name || null,
        responder_acknowledged_at: selected.responder_acknowledged_at || null,
        rescuer_latitude: optionalNumber(selected.rescuer_latitude),
        rescuer_longitude: optionalNumber(selected.rescuer_longitude),
        rescuer_location_updated_at: selected.rescuer_location_updated_at || null,
      };

      hasReportRef.current = true;
      setReport((current) => keepIfEqual(current, normalized));
      setError(null);

      const nextStatus = normalizeStatus(normalized.status);
      if (!Number.isFinite(normalized.latitude) || !Number.isFinite(normalized.longitude) || nextStatus === 'pending' || nextStatus === 'declined' || nextStatus === 'resolved') {
        lastRouteKeyRef.current = '';
        setEtaMinutes(null);
        setDistanceKm(null);
        setRouteCoordinates((current) => keepIfEqual(current, []));
        setLoading(false);
        return;
      }

      const areas = await api.get('/content/evacuation-areas').then((res) => (Array.isArray(res.data) ? res.data : []));
      const activeAreas: EvacuationArea[] = areas
        .map((item: any) => ({
          id: Number(item?.id),
          name: String(item?.name || 'Evacuation Area'),
          barangay: String(item?.barangay || 'Calamba'),
          latitude: Number(item?.latitude),
          longitude: Number(item?.longitude),
          capacity: Number(item?.capacity || 0),
          evacuees: Number(item?.evacuees || 0),
          is_active: item?.is_active !== false,
          created_at: String(item?.created_at || ''),
        }))
        .filter((item: EvacuationArea) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
      setEvacuationAreas((current) => keepIfEqual(current, activeAreas));

      if (activeAreas.length === 0) {
        lastRouteKeyRef.current = '';
        setEtaMinutes(null);
        setDistanceKm(null);
        setRouteCoordinates((current) => keepIfEqual(current, []));
        setLoading(false);
        return;
      }

      const incidentPoint = { latitude: Number(normalized.latitude), longitude: Number(normalized.longitude) };
      const designatedArea = activeAreas.find((area) => area.id === normalized.evacuation_area_id)
        || activeAreas.map((area) => ({ area, dist: distanceSquared(area, incidentPoint) })).sort((a, b) => a.dist - b.dist)[0]?.area;
      const responderPoint = normalized.responder_acknowledged_at
        && Number.isFinite(normalized.rescuer_latitude) && Number.isFinite(normalized.rescuer_longitude)
        ? { latitude: Number(normalized.rescuer_latitude), longitude: Number(normalized.rescuer_longitude) }
        : null;
      const routeDestination = normalized.picked_up_at && designatedArea
        ? { latitude: designatedArea.latitude, longitude: designatedArea.longitude }
        : incidentPoint;

      if (!responderPoint) {
        lastRouteKeyRef.current = '';
        setEtaMinutes(null);
        setDistanceKm(null);
        setRouteCoordinates((current) => keepIfEqual(current, []));
        setLoading(false);
        return;
      }

      const routeKey = `${responderPoint.latitude}:${responderPoint.longitude}:${routeDestination.latitude}:${routeDestination.longitude}`;
      if (lastRouteKeyRef.current === routeKey) {
        setLoading(false);
        return;
      }
      try {
        const routeMetrics = await fetchRoadRoute(
          responderPoint,
          routeDestination,
          true,
          1,
        );
        setEtaMinutes(routeMetrics.etaMinutes);
        setDistanceKm(routeMetrics.distanceKm);
        setRouteCoordinates((current) => keepIfEqual(current, routeMetrics.routeCoordinates));
        lastRouteKeyRef.current = routeKey;
      } catch {
        lastRouteKeyRef.current = '';
        setEtaMinutes(null);
        setDistanceKm(null);
        setRouteCoordinates((current) => keepIfEqual(current, [responderPoint, routeDestination]));
      }
    } catch {
      if (!hasReportRef.current) setError('Unable to load rescue status.');
    } finally {
      syncInFlightRef.current = false;
      setLoading(false);
    }
  }, [reportId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadStatus().catch(() => {
        setLoading(false);
      });

      const timer = setInterval(() => {
        loadStatus().catch(() => {});
      }, 4000);

      return () => {
        clearInterval(timer);
      };
    }, [loadStatus]),
  );

  const status = normalizeStatus(report?.status);
  const hasDispatchedResponder = Boolean(report?.responder_acknowledged_at);
  const showLiveResponseDetails = status !== 'resolved';

  const progressRatio = useMemo(() => {
    if (status === 'accepted') {
      return 0.25;
    }
    if (status === 'in_progress') {
      return 0.5;
    }
    if (status === 'resolved') {
      return 1;
    }
    return 0;
  }, [status]);

  const statusLabel = useMemo(() => {
    if (status === 'accepted') {
      return report?.assigned_team && !report?.responder_acknowledged_at ? 'Awaiting Responder Acknowledgment' : 'Responder En Route';
    }
    if (status === 'in_progress') {
      return 'In Progress';
    }
    if (status === 'resolved') {
      return 'Resolved';
    }
    if (status === 'declined') {
      return 'Declined';
    }
    return 'Pending Validation';
  }, [report?.assigned_team, report?.responder_acknowledged_at, status]);

  const reportCode = report?.report_code || (report ? `RPT-${String(report.id).padStart(6, '0')}` : '-');
  const responderLocation = useMemo(() => (
    report?.responder_acknowledged_at
      && Number.isFinite(report?.rescuer_latitude) && Number.isFinite(report?.rescuer_longitude)
      ? { latitude: Number(report?.rescuer_latitude), longitude: Number(report?.rescuer_longitude) }
      : null
  ), [report?.rescuer_latitude, report?.rescuer_longitude, report?.responder_acknowledged_at]);
  const incidentLocation = useMemo(() => (
    Number.isFinite(report?.latitude) && Number.isFinite(report?.longitude)
      ? { latitude: Number(report?.latitude), longitude: Number(report?.longitude) }
      : null
  ), [report?.latitude, report?.longitude]);
  const routeDestination = useMemo(() => (
    report?.picked_up_at && Number.isFinite(report?.evacuation_latitude) && Number.isFinite(report?.evacuation_longitude)
      ? { latitude: Number(report?.evacuation_latitude), longitude: Number(report?.evacuation_longitude) }
      : incidentLocation
  ), [incidentLocation, report?.evacuation_latitude, report?.evacuation_longitude, report?.picked_up_at]);
  const responderKind = report?.dispatch_type === 'cddrmd_backup' ? 'cddrmd' : 'barangay';
  const apiBaseUrl = String(api.defaults.baseURL || 'http://localhost:4000/api').replace(/\/$/, '');
  const mapHtml = useMemo(() => buildCalambaMapHtml(
    evacuationAreas,
    responderLocation,
    routeCoordinates,
    report?.picked_up_at ? null : incidentLocation,
    reportCode,
    [],
    `${apiBaseUrl}/flood-risk/calamba/barangays`,
    `${apiBaseUrl}/flood-risk/calamba/raster`,
    `${apiBaseUrl}/flood-risk/calamba/rain-impact`,
    { boundary: true, floodHazard: false, evacuationAreas: true, incidentMarkers: true, responderRoute: true, weatherOverlay: false },
    report?.dispatch_type === 'cddrmd_backup' ? 'Live CDRRMD Rescuer location' : 'Live Barangay Rescuer location',
    Boolean(report?.picked_up_at),
    responderKind,
    userLocation,
  ), [apiBaseUrl, evacuationAreas, incidentLocation, report?.dispatch_type, report?.picked_up_at, reportCode, responderKind, responderLocation, routeCoordinates, userLocation]);

  const mapUpdate = useMemo(() => ({
    type: 'rescue-map-update',
    responderLocation,
    routeCoordinates,
    incidentLocation: report?.picked_up_at ? null : incidentLocation,
    selectedReportCode: reportCode,
    responderLabel: report?.dispatch_type === 'cddrmd_backup' ? 'Live CDRRMD Rescuer location' : 'Live Barangay Rescuer location',
    pickedUp: Boolean(report?.picked_up_at),
    responderKind,
    userLocation,
    recenterUserRequestId: recenterRequestId,
  }), [incidentLocation, recenterRequestId, report?.dispatch_type, report?.picked_up_at, reportCode, responderKind, responderLocation, routeCoordinates, userLocation]);

  const recenterOnUser = useCallback(async () => {
    if (locatingUser) return;
    setLocatingUser(true);
    setLocationError(null);
    const result = await requireLiveLocation(true);
    if (result.ok) {
      setUserLocation(result.location);
      setRecenterRequestId((current) => current + 1);
    } else {
      setLocationError(result.message);
    }
    setLocatingUser(false);
  }, [locatingUser]);

  if (loading && !report) {
    return (
      <View style={st.loadingWrap}>
        <ActivityIndicator size="large" color="#0d3558" />
        <Text style={st.loadingText}>Loading rescue status...</Text>
      </View>
    );
  }

  return (
    <View style={st.root}>
      <DashboardHeader backAction={
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn} accessibilityLabel="Back to rescue requests">
          <MaterialCommunityIcons name="arrow-left" size={20} color="#111111" />
        </TouchableOpacity>
      } />

      <ScrollView contentContainerStyle={[st.content, { paddingHorizontal: horizontalPadding }]}>
        <Text style={st.pageTitle}>Rescue Request Status</Text>
        {error ? <Text style={st.errorText}>{error}</Text> : null}

        <View style={st.mainCard}>
          <View style={[st.topRow, isSmall && st.topRowSmall]}>
            <Text style={st.statusText}>Status: <Text style={st.statusStrong}>{statusLabel}</Text></Text>
            {showLiveResponseDetails ? <Text style={st.etaText}>{etaMinutes ? `${Math.max(1, etaMinutes - 1)} - ${etaMinutes + 3} mins` : '--'}</Text> : null}
          </View>

          <View style={st.progressTrack}>
            <View style={[st.progressFill, { width: `${Math.round(progressRatio * 100)}%` }]} />
          </View>

          <View style={st.iconsRow}>
            <MaterialCommunityIcons name="checkbox-marked-circle-outline" size={32} color={progressRatio > 0 ? '#1f8b30' : '#173f5f'} />
            <MaterialCommunityIcons name="account-group" size={34} color={progressRatio >= 0.25 ? '#1f8b30' : '#173f5f'} />
            <MaterialCommunityIcons name="map-marker-path" size={32} color={progressRatio >= 0.5 ? '#1f8b30' : '#173f5f'} />
            <MaterialCommunityIcons name="check-circle" size={32} color={progressRatio >= 1 ? '#1f8b30' : '#173f5f'} />
          </View>
        </View>

        {hasDispatchedResponder ? (
          <>
            <View style={st.mapCard}>
              <PlatformMap key={reportId} html={mapHtml} baseUrl={apiBaseUrl} style={st.map} preserveState updateMessage={mapUpdate} />
              <TouchableOpacity
                accessibilityLabel="Re-center map on your current location"
                accessibilityRole="button"
                disabled={locatingUser}
                onPress={recenterOnUser}
                style={[st.recenterButton, locatingUser && st.recenterButtonDisabled]}
              >
                {locatingUser
                  ? <ActivityIndicator color="#0d3558" size="small" />
                  : <MaterialCommunityIcons name="crosshairs-gps" size={22} color="#0d3558" />}
                <Text style={st.recenterText}>{locatingUser ? 'Locating...' : 'My location'}</Text>
              </TouchableOpacity>
            </View>
            {locationError ? <Text style={st.locationError}>{locationError}</Text> : null}
          </>
        ) : null}

        <View style={st.infoCard}>
          <Text style={st.infoTitle}>Request Details</Text>
          <Text style={st.label}>Report ID</Text>
          <Text style={st.value}>{reportCode}</Text>

          <Text style={st.label}>Assigned Team</Text>
          <Text style={st.value}>{report?.assigned_team || 'Waiting assignment'}</Text>

          {showLiveResponseDetails ? (
            <>
              <Text style={st.label}>Responder Tracking</Text>
              <Text style={st.value}>{responderLocation ? 'Live location and route active' : report?.assigned_team ? report?.responder_acknowledged_at ? 'Waiting for responder GPS' : 'Waiting for responder acknowledgment' : 'Waiting assignment'}</Text>

              <Text style={st.label}>Route Distance</Text>
              <Text style={st.value}>{distanceKm ? `${distanceKm.toFixed(2)} km` : '--'}</Text>

              <Text style={st.label}>ETA</Text>
              <Text style={st.value}>{etaMinutes ? `${Math.max(1, etaMinutes - 1)} - ${etaMinutes + 3} mins` : '--'}</Text>
            </>
          ) : null}

          <Text style={st.label}>Submitted</Text>
          <Text style={st.value}>{report?.created_at ? new Date(report.created_at).toLocaleString() : '-'}</Text>

          <Text style={st.label}>Last Update</Text>
          <Text style={st.value}>{report?.updated_at ? new Date(report.updated_at).toLocaleString() : '-'}</Text>

          {status === 'declined' && report?.decline_explanation ? (
            <>
              <Text style={st.label}>Decline Reason</Text>
              <Text style={st.value}>{report.decline_explanation}</Text>
            </>
          ) : null}

          <Text style={st.metaHint}>Current workflow state: {toTitle(status)}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: editorial.background },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: editorial.background },
  loadingText: { marginTop: 10, fontSize: 13, color: '#475569', fontWeight: '600' },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    marginRight: 6,
  },
  content: { flexGrow: 1, width: '100%', maxWidth: 760, alignSelf: 'center', paddingTop: 16, paddingBottom: 40, backgroundColor: editorial.background },
  pageTitle: { color: editorial.ink, fontSize: 24, lineHeight: 28, marginBottom: 14 },
  errorText: {
    color: '#b91c1c',
    fontWeight: '700',
    fontSize: 12,
    backgroundColor: '#fee2e2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  mainCard: {
    backgroundColor: editorial.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: editorial.border,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topRowSmall: { alignItems: 'flex-start', flexDirection: 'column', gap: 5 },
  statusText: { color: '#1f8b30', fontSize: 18, fontWeight: '500' },
  statusStrong: { color: '#111827', fontWeight: '900' },
  etaText: { color: '#1f8b30', fontWeight: '700', fontSize: 16 },
  progressTrack: {
    marginTop: 14,
    height: 16,
    borderRadius: 999,
    backgroundColor: '#8f8f8f',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1f8b30',
    borderRadius: 999,
  },
  iconsRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoCard: {
    marginTop: 6,
    backgroundColor: editorial.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: editorial.border,
    padding: 14,
  },
  mapCard: {
    height: 320,
    marginTop: 10,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: editorial.border,
    backgroundColor: editorial.surface,
  },
  map: { flex: 1 },
  recenterButton: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    minHeight: 42,
    paddingHorizontal: 12,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    zIndex: 10,
    elevation: 4,
  },
  recenterButtonDisabled: { opacity: 0.7 },
  recenterText: { color: '#0d3558', fontSize: 13, fontWeight: '800' },
  locationError: { color: '#b91c1c', fontSize: 12, fontWeight: '600', marginTop: 6 },
  infoTitle: { color: editorial.ink, fontSize: 18, fontWeight: '400', marginBottom: 10 },
  label: { color: '#475569', fontSize: 12, fontWeight: '700', marginTop: 8 },
  value: { color: '#181818', fontSize: 14, fontWeight: '700', marginTop: 2 },
  metaHint: { color: '#64748b', fontSize: 12, marginTop: 8, fontWeight: '600' },
});
