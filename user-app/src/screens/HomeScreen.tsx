import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  ImageBackground,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { api } from '../services/api';
import { getCityCurrentWeather } from '../services/weatherService';
import { getWeatherVisualByCode } from '../utils/weatherVisual';

type AlertItem = { id: number; title: string; body: string; severity: string };
type AnnouncementItem = { id: number; title: string; body: string };
type NotificationItem = {
  id: number;
  user_id?: number;
  report_id?: number | null;
  title: string;
  body: string;
  created_at: string;
  read_at?: string | null;
};
type ReportLogItem = {
  id: number;
  new_status?: string | null;
  action_note?: string | null;
  created_at: string;
};
type WeatherResponse = { current?: { temperature_2m?: number; weather_code?: number } };

export default function HomeScreen() {
  const navigation = useNavigation();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [news, setNews] = useState<AnnouncementItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [expandedCaseKey, setExpandedCaseKey] = useState<string | null>(null);
  const [reportLogs, setReportLogs] = useState<Record<number, ReportLogItem[]>>({});
  const [loadingLogs, setLoadingLogs] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    const [a, n, ntf, w] = await Promise.allSettled([
      api.get('/content/alerts'),
      api.get('/content/announcements'),
      api.get('/reports/notifications/mine'),
      getCityCurrentWeather(),
    ]);
    setAlerts(a.status === 'fulfilled' ? a.value.data ?? [] : []);
    setNews(n.status === 'fulfilled' ? n.value.data ?? [] : []);
    setNotifications(ntf.status === 'fulfilled' ? ntf.value.data ?? [] : []);
    setWeather(w.status === 'fulfilled' ? (w.value as WeatherResponse) : null);
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const visual = useMemo(
    () => getWeatherVisualByCode(weather?.current?.weather_code),
    [weather?.current?.weather_code],
  );

  const groupedNotifications = useMemo(() => {
    const groups = new Map<
      string,
      {
        caseKey: string;
        reportId: number | null;
        reportCode: string | null;
        title: string;
        latestBody: string;
        latestCreatedAt: string;
        updates: NotificationItem[];
      }
    >();

    const reportCodeRegex = /(RPT-\d{4}-\d{6})/i;

    notifications.forEach((item) => {
      const reportId = Number.isFinite(Number(item.report_id)) ? Number(item.report_id) : null;
      const codeMatch = `${item.title || ''} ${item.body || ''}`.match(reportCodeRegex);
      const reportCode = codeMatch ? codeMatch[1].toUpperCase() : null;
      const fallbackKey = String(item.title || 'General').trim().toLowerCase();
      const caseKey = reportId ? `report-${reportId}` : reportCode ? `code-${reportCode}` : `title-${fallbackKey}`;

      if (!groups.has(caseKey)) {
        groups.set(caseKey, {
          caseKey,
          reportId,
          reportCode,
          title: reportCode ? `Case ${reportCode}` : item.title || 'Case Update',
          latestBody: item.body,
          latestCreatedAt: item.created_at,
          updates: [],
        });
      }

      const group = groups.get(caseKey)!;
      group.updates.push(item);
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        updates: group.updates.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        ),
      }))
      .sort((a, b) => new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime());
  }, [notifications]);

  async function onPressNotificationCase(caseKey: string, reportId: number | null) {
    if (expandedCaseKey === caseKey) {
      setExpandedCaseKey(null);
      return;
    }

    setExpandedCaseKey(caseKey);
    if (!reportId || reportLogs[reportId] || loadingLogs[reportId]) {
      return;
    }

    setLoadingLogs((prev) => ({ ...prev, [reportId]: true }));
    try {
      const response = await api.get(`/reports/${reportId}/logs`);
      const rows = Array.isArray(response.data) ? response.data : [];
      setReportLogs((prev) => ({ ...prev, [reportId]: rows }));
    } catch {
      setReportLogs((prev) => ({ ...prev, [reportId]: [] }));
    } finally {
      setLoadingLogs((prev) => ({ ...prev, [reportId]: false }));
    }
  }

  function formatStatusLabel(value?: string | null) {
    return String(value || 'pending')
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await load().catch(() => {});
    setRefreshing(false);
  };

  return (
    <View style={st.root}>
      {/* Header */}
      <View style={st.header}>
        <View style={st.headerLeft}>
          <View style={st.logoCircle}>
            <Image source={require('../../assets/cdrrmd-logo.png')} style={st.logoImage} />
          </View>
          <Text style={st.headerTitle}>CDRRMD</Text>
        </View>
        <View style={st.headerRight}>
          <TouchableOpacity
            style={st.headerIconBtn}
            onPress={() => {
              setExpandedCaseKey(null);
              setShowNotifications((prev) => !prev);
            }}
          >
            <MaterialCommunityIcons name="bell-outline" size={20} color="#fff" />
            {notifications.length > 0 ? <View style={st.headerBadge} /> : null}
          </TouchableOpacity>
        </View>
      </View>

      {showNotifications ? (
        <View style={st.notificationOverlay}>
          <Pressable
            style={st.notificationBackdrop}
            onPress={() => {
              setShowNotifications(false);
              setExpandedCaseKey(null);
            }}
          />
          <View style={st.notificationPanelFloating}>
            <Text style={st.notificationPanelTitle}>Latest Notifications</Text>
            {groupedNotifications.length === 0 ? (
              <Text style={st.notificationPanelEmpty}>No notifications yet.</Text>
            ) : (
              groupedNotifications.slice(0, 8).map((group) => (
                <TouchableOpacity
                  key={group.caseKey}
                  style={st.notificationPanelItem}
                  activeOpacity={0.85}
                  onPress={() => onPressNotificationCase(group.caseKey, group.reportId)}
                >
                  <View style={st.notificationItemHead}>
                    <Text style={st.notificationPanelItemTitle}>{group.title}</Text>
                    <Text style={st.notificationPanelItemCount}>{group.updates.length} update{group.updates.length > 1 ? 's' : ''}</Text>
                  </View>
                  <Text style={st.notificationPanelItemBody}>{group.latestBody}</Text>
                  <Text style={st.notificationPanelItemTime}>{new Date(group.latestCreatedAt).toLocaleString()}</Text>

                  {expandedCaseKey === group.caseKey ? (
                    <View style={st.notificationExpandedWrap}>
                      {group.reportId && loadingLogs[group.reportId] ? (
                        <Text style={st.notificationExpandedHint}>Loading admin update history...</Text>
                      ) : null}

                      {group.reportId && !loadingLogs[group.reportId] && (reportLogs[group.reportId] || []).length > 0
                        ? reportLogs[group.reportId]
                            .slice()
                            .reverse()
                            .slice(-6)
                            .reverse()
                            .map((log) => (
                              <View key={log.id} style={st.notificationUpdateRow}>
                                <Text style={st.notificationUpdateTitle}>Status: {formatStatusLabel(log.new_status)}</Text>
                                <Text style={st.notificationUpdateBody}>{log.action_note || 'Admin updated this case.'}</Text>
                                <Text style={st.notificationUpdateTime}>{new Date(log.created_at).toLocaleString()}</Text>
                              </View>
                            ))
                        : group.updates.slice(0, 5).map((update) => (
                            <View key={update.id} style={st.notificationUpdateRow}>
                              <Text style={st.notificationUpdateBody}>{update.body}</Text>
                              <Text style={st.notificationUpdateTime}>{new Date(update.created_at).toLocaleString()}</Text>
                            </View>
                          ))}
                    </View>
                  ) : (
                    <Text style={st.notificationExpandedHint}>Tap to view this case updates</Text>
                  )}
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={st.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Weather Card */}
        <TouchableOpacity activeOpacity={0.88} onPress={() => navigation.navigate('Weather' as never)}>
          <ImageBackground
            source={{ uri: visual.backgroundUri }}
            resizeMode="cover"
            style={st.weatherCard}
            imageStyle={{ borderRadius: 14 }}
          >
            <View style={st.weatherOverlay}>
              <Text style={st.weatherLocation}>
                <MaterialCommunityIcons name="map-marker" size={14} color="#fff" /> Calamba City
              </Text>
              <Text style={st.weatherCondition}>
                {visual.condition} • {weather?.current?.temperature_2m ?? '--'}°C (Calamba City)
              </Text>
            </View>
          </ImageBackground>
        </TouchableOpacity>

        {/* Request Rescue */}
        <TouchableOpacity
          style={st.rescueBtn}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Safe Zone' as never)}
        >
          <View style={st.rescueIconBox}>
            <MaterialCommunityIcons name="ambulance" size={38} color="#444" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.rescueTitle}>Request Rescue</Text>
            <Text style={st.rescueSub}>Tap to view Calamba rescue map and location bounds</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#fff" />
        </TouchableOpacity>

        {/* Latest Alerts */}
        <View style={st.sectionHeader}>
          <Text style={st.sectionTitle}>Latest Alerts</Text>
        </View>
        {alerts.length === 0 ? (
          <View style={st.card}><Text style={st.cardMuted}>No alerts yet.</Text></View>
        ) : (
          alerts.slice(0, 3).map((item) => (
            <View key={item.id} style={st.card}>
              <Text style={st.cardTitle}>{item.title}</Text>
              <Text style={st.cardBody}>{item.body}</Text>
              <Text style={st.cardMuted}>Severity: {item.severity}</Text>
            </View>
          ))
        )}

        {/* News & Announcement */}
        <View style={[st.sectionHeader, { marginTop: 4 }]}>
          <Text style={st.sectionTitle}>News & Announcement</Text>
        </View>
        {news.length === 0 ? (
          <View style={st.card}><Text style={st.cardMuted}>No announcements yet.</Text></View>
        ) : (
          news.slice(0, 3).map((item) => (
            <View key={item.id} style={st.card}>
              <Text style={st.cardTitle}>{item.title}</Text>
              <Text style={st.cardBody}>{item.body}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#e8e8ec' },
  header: {
    backgroundColor: '#0d3558',
    paddingTop: 48, paddingBottom: 14, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  logoCircle: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center', marginRight: 8,
    overflow: 'hidden',
  },
  logoImage: { width: 24, height: 24, borderRadius: 12 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  headerIconBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  headerBadge: {
    position: 'absolute',
    top: 6,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    borderWidth: 1,
    borderColor: '#0d3558',
  },
  notificationOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    elevation: 10,
  },
  notificationBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.12)',
  },
  notificationPanelFloating: {
    position: 'absolute',
    top: 86,
    right: 14,
    left: 14,
    maxHeight: 360,
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  notificationPanelTitle: { color: '#0d3558', fontSize: 15, fontWeight: '800', marginBottom: 8 },
  notificationPanelEmpty: { color: '#64748b', fontSize: 12 },
  notificationPanelItem: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  notificationItemHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  notificationPanelItemTitle: { color: '#0f2948', fontSize: 13, fontWeight: '800' },
  notificationPanelItemCount: { color: '#1d4ed8', fontSize: 11, fontWeight: '700' },
  notificationPanelItemBody: { color: '#334155', fontSize: 12, marginTop: 2 },
  notificationPanelItemTime: { color: '#64748b', fontSize: 11, marginTop: 3 },
  notificationExpandedWrap: {
    marginTop: 7,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 7,
  },
  notificationExpandedHint: { color: '#64748b', fontSize: 11, marginTop: 6 },
  notificationUpdateRow: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 6,
    backgroundColor: '#f8fafc',
  },
  notificationUpdateTitle: { color: '#0f2948', fontSize: 12, fontWeight: '700' },
  notificationUpdateBody: { color: '#334155', fontSize: 11, marginTop: 2 },
  notificationUpdateTime: { color: '#64748b', fontSize: 10, marginTop: 2 },
  scrollContent: { padding: 14, paddingBottom: 30 },

  weatherCard: { borderRadius: 14, overflow: 'hidden', marginBottom: 12 },
  weatherOverlay: {
    backgroundColor: 'rgba(0,0,0,0.38)',
    paddingVertical: 18, paddingHorizontal: 16, borderRadius: 14,
  },
  weatherLocation: { color: '#fff', fontSize: 15, fontWeight: '700' },
  weatherCondition: { color: '#fff', fontSize: 14, marginTop: 2 },

  rescueBtn: {
    backgroundColor: '#e67e22', borderRadius: 16, paddingVertical: 28, paddingHorizontal: 18,
    flexDirection: 'row', alignItems: 'center', marginBottom: 14,
    minHeight: 120,
    shadowColor: '#c0392b',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  rescueIconBox: {
    width: 68, height: 68, borderRadius: 16, backgroundColor: '#f5f5f5',
    alignItems: 'center', justifyContent: 'center', marginRight: 16,
  },
  rescueTitle: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: 0.3 },
  rescueSub: { color: 'rgba(255,255,255,0.92)', fontSize: 13, marginTop: 5, lineHeight: 19 },

  reportRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  reportCard: {
    width: '48%' as any, borderRadius: 14, paddingVertical: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  reportIconCircle: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  reportLabel: { color: '#fff', fontSize: 14, fontWeight: '800', marginTop: 6 },

  sectionHeader: {
    backgroundColor: '#d8d8db', borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 12, marginBottom: 10,
  },
  sectionTitle: { color: '#0d3558', fontSize: 20, fontWeight: '800' },

  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10 },
  cardTitle: { color: '#0d3558', fontSize: 15, fontWeight: '700' },
  cardBody: { color: '#475569', fontSize: 13, marginTop: 4, lineHeight: 18 },
  cardMuted: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
});
