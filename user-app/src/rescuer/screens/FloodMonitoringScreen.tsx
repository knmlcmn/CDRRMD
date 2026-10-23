import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '../../components/Typography';
import { Card, EmptyState, ErrorMessage, RescuerScreen, rescuerColors } from '../components/RescuerScreen';
import { loadFloodReports, loadWaterLevelSensors } from '../services/rescuerService';
import type { FloodReport, WaterLevelSensor } from '../types';
import { HIGH_WATER_LEVEL_THRESHOLD, MODERATE_WATER_LEVEL_THRESHOLD } from '../../utils/waterLevelHazard';

function statusLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
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

export default function FloodMonitoringScreen({ onAuthError }: { onAuthError: () => void }) {
  const [sensors, setSensors] = useState<WaterLevelSensor[]>([]);
  const [reports, setReports] = useState<FloodReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loadingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const [nextSensors, nextReports] = await Promise.all([loadWaterLevelSensors(), loadFloodReports()]);
      setSensors(nextSensors);
      setReports(nextReports);
      setError('');
    } catch (caught: any) {
      if (caught?.response?.status === 401) onAuthError();
      else setError(caught?.response?.data?.message || 'Unable to load flood monitoring data.');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [onAuthError]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 2_000);
    return () => clearInterval(timer);
  }, [refresh]);

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
      <View style={styles.lowerGrid}>
        <Card style={styles.reportsCard}>
          <View style={styles.headingRow}><Text style={styles.cardTitle}>Flood Reports</Text><Text style={styles.note}>Read-only monitoring</Text></View>
          {!reports.length ? <EmptyState loading={loading} message="No active flood reports." /> : <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableWrap}><View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHead]}>{['Report ID', 'Barangay', 'Location', 'Water Level', 'Status', 'Reporter'].map((label, index) => <Text key={label} style={[styles.cell, index === 2 && styles.locationCell, styles.headText]}>{label}</Text>)}</View>
            {reports.map((report, index) => <View key={report.id} style={[styles.tableRow, index % 2 === 1 && styles.altRow]}><Text style={[styles.cell, styles.reportCode]}>{report.report_code}</Text><Text style={styles.cell}>{report.assigned_barangay || '-'}</Text><Text style={[styles.cell, styles.locationCell]}>{report.location}</Text><Text style={styles.cell}>{report.water_level || '-'}</Text><Text style={[styles.cell, styles.status]}>{statusLabel(report.status)}</Text><Text style={styles.cell}>{report.reporter_name || '-'}</Text></View>)}
          </View></ScrollView>}
        </Card>
        <Card style={styles.notesCard}><Text style={styles.cardTitle}>Flood Watch Notes</Text><Text style={styles.notesCurrent}>Flood reports: {reports.length}</Text><Text style={styles.notesText}>Sensor readings and flood reports refresh automatically every 2 seconds.</Text><Text style={styles.notesText}>Rescuers have read-only access to flood monitoring.</Text></Card>
      </View>
    </RescuerScreen>
  );
}

const styles = StyleSheet.create({
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sensorPanel: { borderRadius: 7, borderWidth: 1, borderColor: '#64748b', backgroundColor: '#1c3f5a', paddingHorizontal: 13, paddingTop: 14, paddingBottom: 20 },
  title: { color: '#ffffff', fontSize: 18, fontWeight: '900' },
  cardTitle: { color: rescuerColors.ink, fontSize: 17, fontWeight: '900' },
  high: { color: '#64748b', fontSize: 11, fontWeight: '600' },
  sensorGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12, marginTop: 8 },
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
  lowerGrid: { gap: 11 },
  reportsCard: { minWidth: 0 },
  notesCard: { gap: 9 },
  note: { color: rescuerColors.muted, fontSize: 10 },
  tableWrap: { marginTop: 11, borderRadius: 7, borderWidth: 1, borderColor: '#cbd5e1' },
  table: { minWidth: 770 },
  tableRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#cbd5e1' },
  tableHead: { backgroundColor: '#12314b' },
  altRow: { backgroundColor: '#f8fafc' },
  cell: { width: 115, paddingHorizontal: 9, color: '#334155', fontSize: 10 },
  locationCell: { width: 190 },
  headText: { color: '#fff', fontWeight: '900' },
  reportCode: { color: rescuerColors.ink, fontSize: 13, fontWeight: '900' },
  status: { color: '#1d4ed8', fontSize: 10, fontWeight: '900' },
  notesCurrent: { color: rescuerColors.ink, fontSize: 13, fontWeight: '900', marginTop: 5 },
  notesText: { color: '#475569', fontSize: 11, lineHeight: 16 },
});
