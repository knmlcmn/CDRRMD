import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '../../components/Typography';
import { Card, EmptyState, ErrorMessage, RescuerScreen, rescuerColors } from '../components/RescuerScreen';
import { loadFloodReportLogs, loadWaterLevelSensors } from '../services/rescuerService';
import type { FloodReportLogPage, ResponderRole, WaterLevelSensor } from '../types';
import { HIGH_WATER_LEVEL_THRESHOLD, MODERATE_WATER_LEVEL_THRESHOLD } from '../../utils/waterLevelHazard';
import { scopeWaterLevelSensors } from '../utils/sensorScope';

function formatLoggedAt(value: string | null) {
  if (!value) return '—';
  const numericValue = Number(value);
  const timestamp = Number.isFinite(numericValue) && /^\d+$/.test(value)
    ? (numericValue < 10_000_000_000 ? numericValue * 1_000 : numericValue)
    : value;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  });
}

function temperatureAppearance(value: number | null) {
  if (value === null) return { icon: '•', color: '#cbd5e1' };
  if (value >= 32) return { icon: '🔥', color: '#fb7185' };
  if (value < 25) return { icon: '❄', color: '#7dd3fc' };
  return { icon: '☀', color: '#facc15' };
}

function humidityAppearance(value: number | null) {
  if (value === null) return { icon: '•', color: '#cbd5e1' };
  return { icon: value >= 70 ? '🌊' : '💧', color: value >= 70 ? '#818cf8' : '#38bdf8' };
}

function AnimatedWaterGauge({ unavailable, percentage, levelColor }: {
  unavailable: boolean;
  percentage: number;
  levelColor: string;
}) {
  const fillProgress = useRef(new Animated.Value(0)).current;
  const waveProgress = useRef(new Animated.Value(0)).current;
  const bubbleProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Sensor polling can update every two seconds. Keep one short JS-driven
    // height transition and stop the previous transition before starting the
    // next one so Android never accumulates native animation/SVG work.
    fillProgress.stopAnimation();
    const animation = Animated.timing(fillProgress, {
      duration: 450,
      toValue: unavailable ? 0 : percentage,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [fillProgress, percentage, unavailable]);

  useEffect(() => {
    if (unavailable) {
      waveProgress.setValue(0);
      bubbleProgress.setValue(0);
      return undefined;
    }

    // These loops are intentionally independent of percentage. Live sensor
    // updates only animate the fill height and never restart the moving water,
    // preventing the Android blank-screen failure caused by accumulating loops.
    const waveAnimation = Animated.loop(Animated.sequence([
      Animated.timing(waveProgress, { duration: 1_300, easing: Easing.inOut(Easing.sin), toValue: 1, useNativeDriver: true }),
      Animated.timing(waveProgress, { duration: 1_300, easing: Easing.inOut(Easing.sin), toValue: 0, useNativeDriver: true }),
    ]));
    const bubbleAnimation = Animated.loop(Animated.sequence([
      Animated.timing(bubbleProgress, { duration: 2_600, easing: Easing.linear, toValue: 1, useNativeDriver: true }),
      Animated.timing(bubbleProgress, { duration: 0, toValue: 0, useNativeDriver: true }),
    ]));

    waveAnimation.start();
    bubbleAnimation.start();
    return () => {
      waveAnimation.stop();
      bubbleAnimation.stop();
    };
  }, [bubbleProgress, unavailable, waveProgress]);

  return (
    <View style={[styles.gauge, unavailable && styles.unavailableGauge]}>
      <View style={styles.gaugeViewport}>
        {!unavailable ? (
          <Animated.View style={[
            styles.gaugeFill,
            {
              height: fillProgress.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
              backgroundColor: levelColor,
            },
          ]}>
            {percentage > 0 ? <Animated.View style={[
              styles.waterSurface,
              { transform: [{ translateX: waveProgress.interpolate({ inputRange: [0, 1], outputRange: [-9, 9] }) }] },
            ]} /> : null}
            {percentage > 0 ? <Animated.View pointerEvents="none" style={[
              styles.bubbleLayer,
              {
                opacity: bubbleProgress.interpolate({ inputRange: [0, 0.15, 0.82, 1], outputRange: [0.08, 0.55, 0.32, 0.08] }),
                transform: [{ translateY: bubbleProgress.interpolate({ inputRange: [0, 1], outputRange: [22, -22] }) }],
              },
            ]}>
              <View style={[styles.bubble, styles.bubbleOne]} />
              <View style={[styles.bubble, styles.bubbleTwo]} />
              <View style={[styles.bubble, styles.bubbleThree]} />
              <View style={[styles.bubble, styles.bubbleFour]} />
            </Animated.View> : null}
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

type Props = {
  role: ResponderRole;
  barangayName?: string | null;
  onAuthError: () => void;
};

const EMPTY_REPORT_PAGE: FloodReportLogPage = {
  items: [],
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 1,
  view: 'today',
};

export default function FloodMonitoringScreen({ role, barangayName, onAuthError }: Props) {
  const [sensors, setSensors] = useState<WaterLevelSensor[]>([]);
  const [reportView, setReportView] = useState<'today' | 'history'>('today');
  const [reportPage, setReportPage] = useState(1);
  const [reportData, setReportData] = useState<FloodReportLogPage>(EMPTY_REPORT_PAGE);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loadingRef = useRef(false);
  const reportRequestRef = useRef(0);

  const refresh = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const nextSensors = await loadWaterLevelSensors();
      setSensors(scopeWaterLevelSensors(nextSensors, role, barangayName));
      setError('');
    } catch (caught: any) {
      if (caught?.response?.status === 401) onAuthError();
      else setError(caught?.response?.data?.message || 'Unable to load flood monitoring data.');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [barangayName, onAuthError, role]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 2_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const refreshReports = useCallback(async () => {
    const requestId = ++reportRequestRef.current;
    setReportsLoading(true);
    try {
      const nextReports = await loadFloodReportLogs(reportView, reportPage);
      if (requestId !== reportRequestRef.current) return;
      setReportData(nextReports);
      setError('');
      if (reportPage > nextReports.totalPages) setReportPage(nextReports.totalPages);
    } catch (caught: any) {
      if (requestId !== reportRequestRef.current) return;
      if (caught?.response?.status === 401) onAuthError();
      else setError(caught?.response?.data?.message || 'Unable to load flood reports.');
    } finally {
      if (requestId === reportRequestRef.current) setReportsLoading(false);
    }
  }, [onAuthError, reportPage, reportView]);

  useEffect(() => {
    void refreshReports();
    if (reportView === 'history') return undefined;
    const timer = setInterval(() => void refreshReports(), 2_000);
    return () => clearInterval(timer);
  }, [refreshReports, reportView]);

  const highCount = sensors.filter((sensor) => sensor.status === 'Active' && sensor.waterLevelPercentage >= HIGH_WATER_LEVEL_THRESHOLD).length;
  return (
    <RescuerScreen title="Flood Monitoring" subtitle="Live water levels for rescue operations" refreshing={loading} onRefresh={() => void refresh()}>
      <ErrorMessage message={error} />
      <View style={styles.sensorPanel}>
        <View style={styles.headingRow}><Text style={styles.title}>Water Level Indicators</Text><Text style={styles.high}>{highCount} high-level slots</Text></View>
        <View style={styles.sensorGrid}>
          {sensors.map((sensor) => {
            const unavailable = sensor.status === 'Unavailable' || !sensor.hasReading;
            const percentage = Math.max(0, Math.min(100, sensor.waterLevelPercentage));
            const levelColor = unavailable
              ? '#94a3b8'
              : percentage >= HIGH_WATER_LEVEL_THRESHOLD
                ? '#dc2626'
                : percentage >= MODERATE_WATER_LEVEL_THRESHOLD
                  ? '#f59e0b'
                  : '#0284c7';
            const temperature = temperatureAppearance(sensor.temperatureCelsius);
            const humidity = humidityAppearance(sensor.humidityPercentage);
            return <View key={sensor.id} style={styles.sensorCard}>
              <Text style={styles.sensorName}>Brgy. {sensor.barangayName}</Text>
              <AnimatedWaterGauge unavailable={unavailable} percentage={percentage} levelColor={levelColor} />
              <Text style={[styles.percentage, percentage >= HIGH_WATER_LEVEL_THRESHOLD && styles.highPercentage]}>{unavailable ? 'Unavailable' : `${percentage.toFixed(0)}%`}</Text>
              <Text style={[styles.reading, { color: temperature.color }]}>{temperature.icon} Temperature {sensor.temperatureCelsius === null ? '--°C' : `${sensor.temperatureCelsius.toFixed(1)}°C`}</Text>
              <Text style={[styles.reading, { color: humidity.color }]}>{humidity.icon} Humidity {sensor.humidityPercentage === null ? '--%' : `${sensor.humidityPercentage.toFixed(0)}%`}</Text>
            </View>;
          })}
        </View>
      </View>
      <Card style={styles.reportsCard}>
        <View style={styles.headingRow}><Text style={styles.cardTitle}>{reportView === 'today' ? 'Active Flood Reports' : 'Flood Report History'}</Text><Text style={styles.note}>{reportData.total} records</Text></View>
        <View style={styles.reportTabs}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: reportView === 'today' }}
            onPress={() => { setReportView('today'); setReportPage(1); }}
            style={[styles.reportTab, reportView === 'today' && styles.reportTabActive]}
          ><Text style={[styles.reportTabText, reportView === 'today' && styles.reportTabTextActive]}>Today</Text></Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: reportView === 'history' }}
            onPress={() => { setReportView('history'); setReportPage(1); }}
            style={[styles.reportTab, reportView === 'history' && styles.reportTabActive]}
          ><Text style={[styles.reportTabText, reportView === 'history' && styles.reportTabTextActive]}>History</Text></Pressable>
        </View>
        {!reportData.items.length ? <EmptyState loading={reportsLoading} message={reportView === 'today' ? 'No flood reports logged today.' : 'No earlier flood report history.'} /> : <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableWrap}><View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHead]}>{['Location', 'Level', 'Logged', 'Distance'].map((label) => <Text key={label} style={[styles.cell, styles.headText]}>{label}</Text>)}</View>
          {reportData.items.map((report, index) => {
            const level = report.level === 'high' ? 'High' : 'Moderate';
            return <View key={report.id} style={[styles.tableRow, index % 2 === 1 && styles.altRow]}>
              <Text style={[styles.cell, styles.locationCell]}>Brgy. {report.barangay_name}</Text>
              <View style={styles.cell}><Text style={[styles.levelBadge, level === 'High' ? styles.highLevel : styles.moderateLevel]}>{level}</Text></View>
              <Text style={styles.cell}>{formatLoggedAt(report.created_at)}</Text>
              <Text style={styles.cell}>{report.distance_cm === null ? '—' : `${Number(report.distance_cm).toFixed(1)} cm`}</Text>
            </View>;
          })}
        </View></ScrollView>}
        <View style={styles.pagination}>
          <Text style={styles.pageSummary}>{reportData.total === 0 ? '0 records' : `Page ${reportData.page} of ${reportData.totalPages} · 10 per page`}</Text>
          <View style={styles.pageButtons}>
            <Pressable
              accessibilityRole="button"
              disabled={reportsLoading || reportPage <= 1}
              onPress={() => setReportPage((current) => Math.max(1, current - 1))}
              style={[styles.pageButton, (reportsLoading || reportPage <= 1) && styles.pageButtonDisabled]}
            ><Text style={styles.pageButtonText}>Previous</Text></Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={reportsLoading || reportPage >= reportData.totalPages}
              onPress={() => setReportPage((current) => Math.min(reportData.totalPages, current + 1))}
              style={[styles.pageButton, (reportsLoading || reportPage >= reportData.totalPages) && styles.pageButtonDisabled]}
            ><Text style={styles.pageButtonText}>Next</Text></Pressable>
          </View>
        </View>
      </Card>
    </RescuerScreen>
  );
}

const styles = StyleSheet.create({
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sensorPanel: { borderRadius: 7, borderWidth: 1, borderColor: '#64748b', backgroundColor: '#1c3f5a', paddingHorizontal: 13, paddingTop: 14, paddingBottom: 20 },
  title: { color: '#ffffff', fontSize: 18, fontWeight: '900' },
  cardTitle: { color: rescuerColors.ink, fontSize: 17, fontWeight: '900' },
  high: { color: '#64748b', fontSize: 11, fontWeight: '600' },
  sensorGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: 12, marginTop: 8 },
  sensorCard: { width: '50%', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 2 },
  sensorName: { color: '#ffffff', fontSize: 13, fontWeight: '900', textAlign: 'center' },
  gauge: { height: 144, width: 110, alignSelf: 'center', overflow: 'hidden', borderRadius: 16, borderWidth: 2, borderColor: '#0f172a', backgroundColor: '#f1f5f9', padding: 4, marginTop: 10, marginBottom: 5, shadowColor: '#020617', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.42, shadowRadius: 4, elevation: 4 },
  unavailableGauge: { opacity: 0.75 },
  gaugeViewport: { flex: 1, justifyContent: 'flex-end', overflow: 'hidden', borderRadius: 12, backgroundColor: '#e2e8f0' },
  gaugeFill: { width: '100%', position: 'relative', overflow: 'hidden', borderRadius: 12 },
  waterSurface: { position: 'absolute', left: -12, right: -12, top: -6, height: 14, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.48)' },
  bubbleLayer: { ...StyleSheet.absoluteFillObject },
  bubble: { position: 'absolute', borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.25)' },
  bubbleOne: { width: 7, height: 7, left: 12, top: 31 },
  bubbleTwo: { width: 5, height: 5, right: 14, top: 17 },
  bubbleThree: { width: 8, height: 8, left: 28, bottom: 33 },
  bubbleFour: { width: 5, height: 5, right: 31, bottom: 50 },
  percentage: { color: '#ffffff', textAlign: 'center', fontSize: 18, fontWeight: '900' },
  highPercentage: { color: '#fecdd3' },
  reading: { fontSize: 11, lineHeight: 17, fontWeight: '800', textAlign: 'center' },
  reportsCard: { minWidth: 0 },
  note: { color: rescuerColors.muted, fontSize: 10 },
  reportTabs: { flexDirection: 'row', gap: 8, marginTop: 12 },
  reportTab: { borderRadius: 9, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#f8fafc', paddingHorizontal: 14, paddingVertical: 8 },
  reportTabActive: { borderColor: '#1f5d8c', backgroundColor: '#1f5d8c' },
  reportTabText: { color: '#475569', fontSize: 11, fontWeight: '900' },
  reportTabTextActive: { color: '#fff' },
  tableWrap: { marginTop: 11, borderRadius: 7, borderWidth: 1, borderColor: '#cbd5e1' },
  table: { minWidth: 640 },
  tableRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#cbd5e1' },
  tableHead: { backgroundColor: '#12314b' },
  altRow: { backgroundColor: '#f8fafc' },
  cell: { width: 160, paddingHorizontal: 9, color: '#334155', fontSize: 10 },
  locationCell: { color: rescuerColors.ink, fontWeight: '900' },
  headText: { color: '#fff', fontWeight: '900' },
  levelBadge: { alignSelf: 'flex-start', overflow: 'hidden', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, color: '#fff', fontSize: 10, fontWeight: '900' },
  moderateLevel: { backgroundColor: '#d97706' },
  highLevel: { backgroundColor: '#b91c1c' },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12 },
  pageSummary: { flex: 1, color: rescuerColors.muted, fontSize: 10, fontWeight: '700' },
  pageButtons: { flexDirection: 'row', gap: 7 },
  pageButton: { borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff', paddingHorizontal: 11, paddingVertical: 8 },
  pageButtonDisabled: { opacity: 0.42 },
  pageButtonText: { color: rescuerColors.ink, fontSize: 10, fontWeight: '900' },
});
