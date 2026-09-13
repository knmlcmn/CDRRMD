import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { api } from '../services/api';
import { fetchRoadRoute } from '../services/routingService';

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
};

type EvacuationArea = {
  id: number;
  name: string;
  barangay: string;
  latitude: number;
  longitude: number;
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

export default function RescueStatusScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const reportId = Number(route.params?.reportId || 0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<RescueReport | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);

  const loadStatus = useCallback(async () => {
    if (!reportId) {
      setError('Invalid rescue report.');
      setLoading(false);
      return;
    }

    try {
      const rows = await api.get('/reports/mine').then((res) => (Array.isArray(res.data) ? res.data : []));
      const selected = rows.find((item: any) => Number(item?.id) === reportId);
      if (!selected) {
        setError('Rescue report not found.');
        setReport(null);
        setLoading(false);
        return;
      }

      const normalized: RescueReport = {
        id: Number(selected.id),
        report_code: selected.report_code || null,
        status: selected.status || 'pending',
        latitude: Number.isFinite(Number(selected.latitude)) ? Number(selected.latitude) : null,
        longitude: Number.isFinite(Number(selected.longitude)) ? Number(selected.longitude) : null,
        created_at: selected.created_at,
        updated_at: selected.updated_at,
        assigned_team: selected.assigned_team || null,
        decline_explanation: selected.decline_explanation || null,
      };

      setReport(normalized);
      setError(null);
      setLastSyncAt(new Date());

      const nextStatus = normalizeStatus(normalized.status);
      if (!Number.isFinite(normalized.latitude) || !Number.isFinite(normalized.longitude) || nextStatus === 'pending' || nextStatus === 'declined') {
        setEtaMinutes(null);
        setDistanceKm(null);
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
        }))
        .filter((item: EvacuationArea) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));

      if (activeAreas.length === 0) {
        setEtaMinutes(null);
        setDistanceKm(null);
        setLoading(false);
        return;
      }

      const incidentPoint = { latitude: Number(normalized.latitude), longitude: Number(normalized.longitude) };
      const nearest = activeAreas
        .map((area) => ({ area, dist: distanceSquared(area, incidentPoint) }))
        .sort((a, b) => a.dist - b.dist)[0]?.area;

      if (!nearest) {
        setEtaMinutes(null);
        setDistanceKm(null);
        setLoading(false);
        return;
      }

      try {
        const routeMetrics = await fetchRoadRoute(
          { latitude: nearest.latitude, longitude: nearest.longitude },
          incidentPoint,
          false,
          1,
        );
        setEtaMinutes(routeMetrics.etaMinutes);
        setDistanceKm(routeMetrics.distanceKm);
      } catch {
        setEtaMinutes(null);
        setDistanceKm(null);
      }
    } catch {
      setError('Unable to refresh rescue status.');
    } finally {
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
      return 'Confirmed';
    }
    if (status === 'in_progress') {
      return 'Team Dispatched';
    }
    if (status === 'resolved') {
      return 'Resolved';
    }
    if (status === 'declined') {
      return 'Declined';
    }
    return 'Pending Validation';
  }, [status]);

  const reportCode = report?.report_code || (report ? `RPT-${String(report.id).padStart(6, '0')}` : '-');

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
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Rescue Request Status</Text>
      </View>

      <ScrollView contentContainerStyle={st.content}>
        {error ? <Text style={st.errorText}>{error}</Text> : null}

        <View style={st.mainCard}>
          <View style={st.topRow}>
            <Text style={st.statusText}>Status: <Text style={st.statusStrong}>{statusLabel}</Text></Text>
            <Text style={st.etaText}>{etaMinutes ? `${Math.max(1, etaMinutes - 1)} - ${etaMinutes + 3} mins` : '--'}</Text>
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

        <View style={st.infoCard}>
          <Text style={st.infoTitle}>Request Details</Text>
          <Text style={st.label}>Report ID</Text>
          <Text style={st.value}>{reportCode}</Text>

          <Text style={st.label}>Assigned Team</Text>
          <Text style={st.value}>{report?.assigned_team || 'Waiting assignment'}</Text>

          <Text style={st.label}>Route Distance</Text>
          <Text style={st.value}>{distanceKm ? `${distanceKm.toFixed(2)} km` : '--'}</Text>

          <Text style={st.label}>ETA</Text>
          <Text style={st.value}>{etaMinutes ? `${Math.max(1, etaMinutes - 1)} - ${etaMinutes + 3} mins` : '--'}</Text>

          <Text style={st.label}>Submitted</Text>
          <Text style={st.value}>{report?.created_at ? new Date(report.created_at).toLocaleString() : '-'}</Text>

          <Text style={st.label}>Last Update</Text>
          <Text style={st.value}>{report?.updated_at ? new Date(report.updated_at).toLocaleString() : '-'}</Text>

          <Text style={st.label}>Realtime Sync</Text>
          <Text style={st.value}>{lastSyncAt ? lastSyncAt.toLocaleTimeString() : '-'}</Text>

          {status === 'declined' && report?.decline_explanation ? (
            <>
              <Text style={st.label}>Decline Reason</Text>
              <Text style={st.value}>{report.decline_explanation}</Text>
            </>
          ) : null}

          <Text style={st.metaHint}>Auto-refresh every 4 seconds</Text>
          <Text style={st.metaHint}>Current workflow state: {toTitle(status)}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#e5e7eb' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef2f7' },
  loadingText: { marginTop: 10, fontSize: 13, color: '#475569', fontWeight: '600' },
  header: {
    backgroundColor: '#0d3558',
    paddingTop: 48,
    paddingBottom: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginRight: 10,
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  content: { padding: 14, paddingBottom: 28 },
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
    backgroundColor: '#f3f4f6',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
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
    marginTop: 12,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbe2ea',
    padding: 14,
  },
  infoTitle: { color: '#0f2948', fontSize: 16, fontWeight: '900', marginBottom: 10 },
  label: { color: '#475569', fontSize: 12, fontWeight: '700', marginTop: 8 },
  value: { color: '#0f2948', fontSize: 14, fontWeight: '700', marginTop: 2 },
  metaHint: { color: '#64748b', fontSize: 12, marginTop: 8, fontWeight: '600' },
});
