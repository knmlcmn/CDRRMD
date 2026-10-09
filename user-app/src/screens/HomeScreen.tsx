import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppText as Text } from '../components/Typography';
import { editorial } from '../components/EditorialTheme';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { HomeFeedArtwork, type HomeFeedIconName } from '../components/HomeFeedArtwork';
import { NotificationArtwork } from '../components/NotificationArtwork';
import { DashboardHeader } from '../components/DashboardHeader';
import {
  MetricAccent,
  TemperatureArtwork,
  temperatureIconFromCelsius,
  WeatherConditionArtwork,
  weatherAdvice,
  weatherIconFromCode,
} from '../components/WeatherMetricArtwork';
import { api } from '../services/api';
import { getCityCurrentWeather } from '../services/weatherService';
import { getWeatherVisualByCode } from '../utils/weatherVisual';
import { useResponsiveLayout } from '../utils/responsive';
import { keepIfEqual } from '../utils/stableData';

type AlertItem = { id: number; title: string; body: string; severity: string; category?: string; created_at?: string };
type AnnouncementItem = { id: number; title: string; body: string; created_at?: string };
type NotificationItem = {
  id: number;
  user_id?: number;
  report_id?: number | null;
  title: string;
  body: string;
  category?: string;
  severity?: string;
  barangay_name?: string | null;
  source_event_key?: string | null;
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

type HomeScreenProps = {
  barangayName?: string;
};

const BARANGAY_DASHBOARD_SEALS = {
  sampiruhan: require('../../assets/sampi-seal-dashboard.jpg'),
  lingga: require('../../assets/lingga-seal-dashboard.jpg'),
  looc: require('../../assets/looc-seal-dashboard.jpg'),
  palingon: require('../../assets/palingon-seal-dashboard.jpg'),
  parian: require('../../assets/parian-seal-dashboard.jpg'),
  uwisan: require('../../assets/uwisan-seal-dashboard.jpg'),
} as const;

function relativeTime(value?: string) {
  if (!value) return '';
  const elapsed = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return '';
  const minutes = Math.max(1, Math.floor(elapsed / 60_000));
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

function alertIcon(item: AlertItem): HomeFeedIconName {
  const content = `${item.title} ${item.category ?? ''} ${item.severity}`.toLowerCase();
  if (content.includes('road') || content.includes('closure')) {
    return 'roadClosure';
  }
  if (content.includes('evac') || content.includes('critical') || content.includes('high')) {
    return 'evacAdvisory';
  }
  return 'weather';
}

function newsIcon(item: AnnouncementItem, index: number): HomeFeedIconName {
  const content = `${item.title} ${item.body}`.toLowerCase();
  if (content.includes('weather') || content.includes('rain') || content.includes('storm')) {
    return 'weatherUpdate';
  }
  if (content.includes('reduction') || content.includes('risk') || content.includes('location')) {
    return 'reduction';
  }
  return index === 0 ? 'weatherUpdate' : index === 1 ? 'reduction' : 'announcement';
}

export default function HomeScreen({ barangayName = '' }: HomeScreenProps) {
  const navigation = useNavigation();
  const { width: screenWidth, uiScale: designScale, horizontalPadding } = useResponsiveLayout();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [news, setNews] = useState<AnnouncementItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [expandedCaseKey, setExpandedCaseKey] = useState<string | null>(null);
  const [reportLogs, setReportLogs] = useState<Record<number, ReportLogItem[]>>({});
  const [loadingLogs, setLoadingLogs] = useState<Record<number, boolean>>({});
  const [showNewNotificationLabel, setShowNewNotificationLabel] = useState(false);
  const knownNotificationIds = useRef<Set<number>>(new Set());
  const notificationsLoaded = useRef(false);
  const newLabelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyNotifications = useCallback((rows: NotificationItem[]) => {
    const nextRows = Array.isArray(rows) ? rows : [];
    const hasNewUnread = nextRows.some(
      (item) => !item.read_at && (!notificationsLoaded.current || !knownNotificationIds.current.has(item.id)),
    );
    knownNotificationIds.current = new Set(nextRows.map((item) => item.id));
    notificationsLoaded.current = true;
    setNotifications((current) => keepIfEqual(current, nextRows));

    if (hasNewUnread) {
      setShowNewNotificationLabel(true);
      if (newLabelTimer.current) clearTimeout(newLabelTimer.current);
      newLabelTimer.current = setTimeout(() => setShowNewNotificationLabel(false), 5_000);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    const response = await api.get('/reports/notifications/mine');
    applyNotifications(response.data ?? []);
  }, [applyNotifications]);

  const load = useCallback(async () => {
    const [a, n, ntf, w] = await Promise.allSettled([
      api.get('/content/alerts'),
      api.get('/content/announcements'),
      api.get('/reports/notifications/mine'),
      getCityCurrentWeather(),
    ]);
    if (a.status === 'fulfilled') setAlerts((current) => keepIfEqual(current, a.value.data ?? []));
    if (n.status === 'fulfilled') setNews((current) => keepIfEqual(current, n.value.data ?? []));
    if (ntf.status === 'fulfilled') applyNotifications(ntf.value.data ?? []);
    if (w.status === 'fulfilled') setWeather((current) => keepIfEqual(current, w.value as WeatherResponse));
  }, [applyNotifications]);

  useEffect(() => {
    load().catch(() => {});
    const timer = setInterval(() => loadNotifications().catch(() => {}), 8_000);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') loadNotifications().catch(() => {});
    });
    const refreshWhenVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        loadNotifications().catch(() => {});
      }
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('focus', refreshWhenVisible);
      window.addEventListener('online', refreshWhenVisible);
      document.addEventListener('visibilitychange', refreshWhenVisible);
    }
    return () => {
      clearInterval(timer);
      appStateSubscription.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('focus', refreshWhenVisible);
        window.removeEventListener('online', refreshWhenVisible);
        document.removeEventListener('visibilitychange', refreshWhenVisible);
      }
      if (newLabelTimer.current) clearTimeout(newLabelTimer.current);
    };
  }, [load, loadNotifications]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read_at).length,
    [notifications],
  );

  const visual = useMemo(
    () => getWeatherVisualByCode(weather?.current?.weather_code),
    [weather?.current?.weather_code],
  );
  const currentWeatherCode = weather?.current?.weather_code;
  const currentTemperature = weather?.current?.temperature_2m;
  const currentWeatherIcon = weatherIconFromCode(currentWeatherCode);
  const currentTemperatureIcon = temperatureIconFromCelsius(currentTemperature);

  const displayBarangay = barangayName.trim() || 'Sampiruhan';
  const barangayKey = displayBarangay.toLowerCase().replace(/^(?:brgy\.?|barangay)\s*/, '').trim();
  const dashboardSeal = BARANGAY_DASHBOARD_SEALS[barangayKey as keyof typeof BARANGAY_DASHBOARD_SEALS];
  const barangayHero = dashboardSeal
    ?? require('../../assets/Calamba_City_Hall_(Chipeco_Ave.,_Calamba,_Laguna)(2018-08-21).jpg');
  const heroHeight = Math.round(126 * designScale);
  const heroImageWidth = Math.round(heroHeight * (328 / 226));
  const cardHeight = Math.round(27 * designScale);
  const sectionLayout = {
    fontSize: 10 * designScale,
    lineHeight: 13 * designScale,
    paddingHorizontal: 10 * designScale,
    paddingTop: 10 * designScale,
    paddingBottom: 5 * designScale,
  };
  const cardLayout = {
    minHeight: cardHeight,
    paddingHorizontal: 10 * designScale,
    paddingVertical: 5 * designScale,
    marginHorizontal: 8 * designScale,
    marginBottom: 6 * designScale,
    borderRadius: 7 * designScale,
  };
  const cardTitleLayout = { fontSize: 7.6 * designScale, lineHeight: 9 * designScale };
  const cardBodyLayout = { fontSize: 5.5 * designScale, lineHeight: 7 * designScale };

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
      const caseKey = item.category === 'flood_sensor'
        ? `notification-${item.id}`
        : reportId
          ? `report-${reportId}`
          : reportCode
            ? `code-${reportCode}`
            : `title-${fallbackKey}`;

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

  async function toggleNotifications() {
    const opening = !showNotifications;
    setExpandedCaseKey(null);
    setShowNotifications(opening);
    if (!opening || unreadCount === 0) return;

    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => (
      item.read_at ? item : { ...item, read_at: readAt }
    )));
    await api.patch('/reports/notifications/read-all').catch(() => {});
  }

  return (
      <View style={st.root}>
      <DashboardHeader action={<TouchableOpacity
          style={[st.headerIconBtn, {
            width: 29 * designScale,
            height: 29 * designScale,
          }]}
          accessibilityLabel={`Latest notifications, ${unreadCount} unread`}
          onPress={toggleNotifications}
        >
          <NotificationArtwork scale={designScale} showUnread={unreadCount > 0} />
          {showNewNotificationLabel ? (
            <View style={st.newNotificationLabel}>
              <Text style={st.newNotificationLabelText}>New notification</Text>
            </View>
          ) : null}
        </TouchableOpacity>} />

      {showNotifications ? (
        <View style={st.notificationOverlay}>
          <Pressable
            style={st.notificationBackdrop}
            onPress={() => {
              setShowNotifications(false);
              setExpandedCaseKey(null);
            }}
          />
          <View style={[st.notificationPanelFloating, {
            top: 47 * designScale,
            width: Math.min(screenWidth - (horizontalPadding * 2), 680),
            right: horizontalPadding,
          }]}>
            <View style={st.notificationPanelHeader}>
              <Text style={st.notificationPanelTitle}>Latest Notifications</Text>
              <Text style={st.notificationArchiveLabel}>Notification history</Text>
            </View>
            {groupedNotifications.length === 0 ? (
              <Text style={st.notificationPanelEmpty}>No notifications yet.</Text>
            ) : (
              <ScrollView style={st.notificationHistoryList} showsVerticalScrollIndicator>
              {groupedNotifications.map((group) => (
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
                        ? reportLogs[group.reportId].map((log) => (
                              <View key={log.id} style={st.notificationUpdateRow}>
                                <Text style={st.notificationUpdateTitle}>Status: {formatStatusLabel(log.new_status)}</Text>
                                <Text style={st.notificationUpdateBody}>{log.action_note || 'Admin updated this case.'}</Text>
                                <Text style={st.notificationUpdateTime}>{new Date(log.created_at).toLocaleString()}</Text>
                              </View>
                            ))
                        : group.updates.map((update) => (
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
              ))}
              </ScrollView>
            )}
          </View>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[st.scrollContent, { paddingHorizontal: horizontalPadding }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Barangay and current weather */}
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={() => navigation.navigate('Weather' as never)}
          style={[st.barangayHero, { height: heroHeight }]}
        >
            <Image
              source={barangayHero}
              resizeMode="cover"
              style={dashboardSeal
                ? [st.barangaySeal, { width: 116 * designScale, height: 116 * designScale, right: 3 * designScale, top: 0 }]
                : [st.heroImage, { width: heroImageWidth }]}
            />
            <View style={[st.heroCopy, {
              top: 13 * designScale,
              left: 13 * designScale,
              width: '52%',
            }]}>
              <Text style={[st.heroBarangay, {
                fontSize: 11 * designScale,
                lineHeight: 13 * designScale,
              }]}>Brgy. {displayBarangay.toUpperCase()}</Text>
              <Text style={[st.heroCity, {
                fontSize: 7 * designScale,
                lineHeight: 8 * designScale,
                marginTop: 2 * designScale,
              }]}>Calamba City</Text>
              <View style={[st.heroWeatherRow, { marginTop: 7 * designScale, width: 71 * designScale }]}>
                <View style={st.heroMetric}>
                  <View style={st.heroWeatherItem}>
                    <WeatherConditionArtwork name={currentWeatherIcon} scale={0.8 * designScale} />
                    <Text style={[st.heroWeatherText, { fontSize: 5 * designScale }]}>{visual.condition}</Text>
                  </View>
                  <MetricAccent type="weather" scale={designScale} />
                </View>
                <View style={st.heroMetric}>
                  <View style={st.heroWeatherItem}>
                    <TemperatureArtwork name={currentTemperatureIcon} scale={0.8 * designScale} />
                    <Text style={[st.heroWeatherText, { fontSize: 5 * designScale }]}>{currentTemperature ?? '--'}°C</Text>
                  </View>
                  <MetricAccent type="temperature" scale={designScale} />
                </View>
              </View>
              <Text style={[st.heroAdvice, {
                fontSize: 5 * designScale,
                lineHeight: 6 * designScale,
                marginTop: 8 * designScale,
                width: 104 * designScale,
              }]}>{weatherAdvice(currentWeatherCode, currentTemperature)}</Text>
            </View>
        </TouchableOpacity>

        <View style={[st.contentPanel, {
          paddingBottom: 72 * designScale,
          marginTop: 6 * designScale,
        }]}>
          {/* Latest Alerts */}
          <Text style={[st.sectionTitle, sectionLayout]}>Latest Alerts</Text>
          {alerts.length === 0 ? (
            <View style={[st.card, cardLayout]}><Text style={st.cardMuted}>No alerts yet.</Text></View>
          ) : (
            alerts.slice(0, 3).map((item) => {
              return (
                <View key={item.id} style={[st.card, cardLayout]}>
                  <HomeFeedArtwork name={alertIcon(item)} scale={0.82 * designScale} />
                  <View style={[st.cardCopy, { marginHorizontal: 5 * designScale }]}>
                    <Text style={[st.cardTitle, cardTitleLayout]} numberOfLines={1}>{item.title}</Text>
                    <Text style={[st.cardBody, cardBodyLayout]} numberOfLines={1}>{item.body}</Text>
                  </View>
                  <Text style={[st.cardTime, { fontSize: 4 * designScale }]}>{relativeTime(item.created_at)}</Text>
                </View>
              );
            })
          )}

          {/* News & Announcement */}
          <Text style={[st.sectionTitle, sectionLayout, st.newsSectionTitle]}>News &amp; Announcement</Text>
          {news.length === 0 ? (
            <View style={[st.card, cardLayout]}><Text style={st.cardMuted}>No announcements yet.</Text></View>
          ) : (
            news.slice(0, 3).map((item, index) => (
              <TouchableOpacity key={item.id} style={[st.card, cardLayout]} activeOpacity={0.8}>
                <HomeFeedArtwork name={newsIcon(item, index)} scale={0.82 * designScale} />
                <View style={[st.cardCopy, { marginHorizontal: 5 * designScale }]}>
                  <Text style={[st.cardTitle, cardTitleLayout]} numberOfLines={1}>{item.title}</Text>
                  <Text style={[st.cardBody, cardBodyLayout]} numberOfLines={1}>{item.body}</Text>
                </View>
                <Text style={[st.cardTime, { fontSize: 4 * designScale }]}>{relativeTime(item.created_at)}</Text>
                <MaterialCommunityIcons name="chevron-right" size={13 * designScale} color="#111111" />
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
      </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: editorial.background },
  headerIconBtn: {
    width: 34, height: 34,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  newNotificationLabel: {
    position: 'absolute',
    right: 42,
    minWidth: 108,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    paddingHorizontal: 9,
    paddingVertical: 5,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 3 },
  },
  newNotificationLabelText: { color: editorial.accent, fontSize: 11, fontWeight: '700', textAlign: 'center' },
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
    top: 68,
    maxHeight: 480,
    backgroundColor: editorial.background,
    borderColor: editorial.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
  },
  notificationPanelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  notificationPanelTitle: { color: editorial.ink, fontSize: 19, fontWeight: '400' },
  notificationArchiveLabel: { color: '#64748b', fontSize: 10, fontWeight: '700' },
  notificationHistoryList: { flexGrow: 0 },
  notificationPanelEmpty: { color: '#64748b', fontSize: 12 },
  notificationPanelItem: {
    borderWidth: 1,
    borderColor: editorial.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  notificationItemHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  notificationPanelItemTitle: { color: editorial.ink, fontSize: 13, fontWeight: '700' },
  notificationPanelItemCount: { color: editorial.accent, fontSize: 11, fontWeight: '700' },
  notificationPanelItemBody: { color: editorial.muted, fontSize: 12, marginTop: 2 },
  notificationPanelItemTime: { color: '#64748b', fontSize: 11, marginTop: 3 },
  notificationExpandedWrap: {
    marginTop: 7,
    borderTopWidth: 1,
    borderTopColor: editorial.border,
    paddingTop: 7,
  },
  notificationExpandedHint: { color: '#64748b', fontSize: 11, marginTop: 6 },
  notificationUpdateRow: {
    borderWidth: 1,
    borderColor: editorial.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 6,
    backgroundColor: editorial.accentSoft,
  },
  notificationUpdateTitle: { color: editorial.ink, fontSize: 12, fontWeight: '700' },
  notificationUpdateBody: { color: editorial.muted, fontSize: 11, marginTop: 2 },
  notificationUpdateTime: { color: '#64748b', fontSize: 10, marginTop: 2 },
  scrollContent: { flexGrow: 1, width: '100%', backgroundColor: editorial.background },

  barangayHero: {
    width: '100%', maxWidth: 720, alignSelf: 'center',
    backgroundColor: editorial.surface,
    marginTop: 10,
    borderRadius: 14,
    overflow: 'hidden',
  },
  heroImage: { position: 'absolute', left: 0, top: 0, height: '100%' },
  barangaySeal: { position: 'absolute', right: 1, top: -5 },
  heroCopy: {
    position: 'absolute',
  },
  heroBarangay: { color: editorial.ink, letterSpacing: 0, fontWeight: '800', includeFontPadding: false },
  heroCity: { color: editorial.ink, fontWeight: '700', includeFontPadding: false },
  heroWeatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 9,
  },
  heroMetric: { alignItems: 'flex-start' },
  heroWeatherItem: { flexDirection: 'row', alignItems: 'center' },
  heroWeatherText: { color: editorial.ink, fontSize: 8, marginLeft: 3, fontWeight: '600' },
  heroAdvice: { color: editorial.muted, fontSize: 8, lineHeight: 10, marginTop: 8 },
  contentPanel: { flexGrow: 1, width: '100%', maxWidth: 720, alignSelf: 'center', backgroundColor: editorial.background },
  sectionTitle: {
    color: editorial.ink,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '400',
    paddingHorizontal: 9,
    paddingTop: 7,
    paddingBottom: 4,
  },
  newsSectionTitle: { paddingTop: 0 },
  card: {
    minHeight: 47,
    backgroundColor: editorial.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: editorial.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginHorizontal: 8,
    marginBottom: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardCopy: { flex: 1, minWidth: 0, marginHorizontal: 10 },
  cardTitle: { color: editorial.ink, fontWeight: '700', includeFontPadding: false },
  cardBody: { color: editorial.muted, fontSize: 8, lineHeight: 11 },
  cardTime: { color: editorial.muted, fontSize: 7, marginLeft: 4, alignSelf: 'flex-end' },
  cardMuted: { color: '#777777', fontSize: 10 },
});
