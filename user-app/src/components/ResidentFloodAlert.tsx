import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Modal, Platform, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { AppText as Text } from './Typography';
import { editorial } from './EditorialTheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { api } from '../services/api';

type FloodNotification = {
  id: number;
  title: string;
  body: string;
  category?: string;
  severity?: string;
  barangay_name?: string | null;
  created_at: string;
  read_at?: string | null;
  is_test_account?: boolean;
  matches_current_location?: boolean;
};

type Props = {
  onTestAccountRemoved?: () => Promise<void> | void;
  onSendRescue?: (notificationId: number) => Promise<void> | void;
};

export default function ResidentFloodAlert({ onTestAccountRemoved, onSendRescue }: Props) {
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const [alert, setAlert] = useState<FloodNotification | null>(null);
  const coordinatesRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const suppressedAlertIdsRef = useRef(new Set<number>());
  const warningPulse = useRef(new Animated.Value(0)).current;

  const checkAlerts = useCallback(async () => {
    const response = await api.get('/reports/notifications/mine', {
      params: coordinatesRef.current || undefined,
    });
    const notifications = Array.isArray(response.data) ? response.data as FloodNotification[] : [];
    const matchingUnread = notifications.filter(
      (item) => item.category === 'flood_sensor'
        && !item.read_at
        && item.matches_current_location !== false
        && !suppressedAlertIdsRef.current.has(item.id),
    );
    const latestUnread = matchingUnread.find(
      (item) => String(item.severity || '').toLowerCase() === 'high',
    ) || matchingUnread[0];
    setAlert((current) => {
      if (!latestUnread) return current;
      const incomingIsHigh = String(latestUnread.severity || '').toLowerCase() === 'high';
      const currentIsHigh = String(current?.severity || '').toLowerCase() === 'high';
      return !current || (incomingIsHigh && !currentIsHigh) ? latestUnread : current;
    });
  }, []);

  useEffect(() => {
    let locationSubscription: Location.LocationSubscription | null = null;
    let active = true;

    async function startLocationAlerts() {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!active || permission.status !== 'granted') return;

      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      coordinatesRef.current = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      };
      await checkAlerts();

      locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 30_000,
          distanceInterval: 50,
        },
        (position) => {
          coordinatesRef.current = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          checkAlerts().catch(() => {});
        },
      );
    }

    startLocationAlerts().catch(() => {});
    const timer = setInterval(() => checkAlerts().catch(() => {}), 8_000);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkAlerts().catch(() => {});
    });
    const refreshWhenVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        checkAlerts().catch(() => {});
      }
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('focus', refreshWhenVisible);
      window.addEventListener('online', refreshWhenVisible);
      document.addEventListener('visibilitychange', refreshWhenVisible);
    }
    return () => {
      active = false;
      clearInterval(timer);
      appStateSubscription.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('focus', refreshWhenVisible);
        window.removeEventListener('online', refreshWhenVisible);
        document.removeEventListener('visibilitychange', refreshWhenVisible);
      }
      locationSubscription?.remove();
    };
  }, [checkAlerts]);

  useEffect(() => {
    if (!alert) {
      warningPulse.setValue(0);
      return undefined;
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(warningPulse, {
        toValue: 1,
        duration: 650,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(warningPulse, {
        toValue: 0,
        duration: 650,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [alert, warningPulse]);

  async function dismiss() {
    const current = alert;
    setAlert(null);
    if (current) {
      const response = await api.patch(`/reports/notifications/${current.id}/read`).catch(() => null);
      if (response?.data?.accountDeleted) {
        await onTestAccountRemoved?.();
        return;
      }
      checkAlerts().catch(() => {});
    }
  }

  async function sendRescue() {
    const current = alert;
    if (!current) return;
    // The API consumes this unread notification as verified proof only after
    // the rescue request is successfully submitted.
    suppressedAlertIdsRef.current.add(current.id);
    setAlert(null);
    await onSendRescue?.(current.id);
  }

  const high = String(alert?.severity || '').toLowerCase() === 'high';
  const accent = high ? '#d92d20' : '#d97706';
  const dangerDark = high ? '#7a271a' : '#92400e';
  const advisoryTitle = high ? 'Immediate evacuation required' : 'Prepare to evacuate';
  const advisoryBody = high
    ? `Water has reached a dangerous level${alert?.barangay_name ? ` in Barangay ${alert.barangay_name}` : ''}. Evacuate to higher ground immediately. If you cannot leave safely, request rescue now.`
    : `Water levels are rising${alert?.barangay_name ? ` in Barangay ${alert.barangay_name}` : ''}. Prepare to evacuate immediately. If you need assistance, request rescue now.`;
  const compact = viewportHeight < 760 || viewportWidth < 390;
  const alertScale = viewportHeight < 560
    ? Math.max(0.72, Math.min(1, (viewportHeight - 12) / 520))
    : 1;

  return (
    <Modal visible={Boolean(alert)} transparent animationType="fade" statusBarTranslucent onRequestClose={dismiss}>
      <View style={[styles.backdrop, compact && styles.backdropCompact]}>
        <View style={[styles.card, compact && styles.cardCompact, { borderColor: accent, transform: [{ scale: alertScale }] }]} accessibilityViewIsModal accessibilityLiveRegion="assertive">
          <View style={[styles.emergencyHeader, compact && styles.emergencyHeaderCompact, { backgroundColor: dangerDark }]}>
            <View style={styles.iconStage}>
              <Animated.View style={[
                styles.pulseRing,
                {
                  opacity: warningPulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                  transform: [{ scale: warningPulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.45] }) }],
                },
              ]} />
              <View style={[styles.emergencyIcon, compact && styles.emergencyIconCompact]}>
                <MaterialCommunityIcons name="alert-octagon" size={compact ? 28 : 40} color={dangerDark} />
              </View>
            </View>
            <Text style={[styles.emergencyLabel, compact && styles.emergencyLabelCompact]}>EMERGENCY FLOOD ALERT</Text>
            <View style={[styles.risingRow, compact && styles.risingRowCompact]}>
              <MaterialCommunityIcons name="waves-arrow-up" size={compact ? 15 : 18} color="#ffffff" />
              <Text style={[styles.risingText, compact && styles.risingTextCompact]}>WATER LEVELS ARE RISING</Text>
            </View>
          </View>

          <View style={[styles.content, compact && styles.contentCompact]}>
            <View style={[styles.severityBadge, { backgroundColor: high ? '#fee4e2' : '#fef3c7' }]}>
              <View style={[styles.severityDot, { backgroundColor: accent }]} />
              <Text style={[styles.level, { color: dangerDark }]}>{high ? 'DANGEROUS WATER LEVEL' : 'ELEVATED WATER LEVEL'}</Text>
            </View>
            <Text style={[styles.title, compact && styles.titleCompact, { color: dangerDark }]}>{advisoryTitle}</Text>
            <Text style={[styles.body, compact && styles.bodyCompact]}>{advisoryBody}</Text>

            <View style={[styles.instructionBox, compact && styles.instructionBoxCompact, { borderLeftColor: accent }]}>
              <MaterialCommunityIcons name="run-fast" size={compact ? 21 : 25} color={dangerDark} />
              <View style={styles.instructionCopy}>
                <Text style={[styles.instructionTitle, { color: dangerDark }]}>EVACUATE NOW</Text>
                <Text style={[styles.instructionText, compact && styles.instructionTextCompact]}>Move to higher ground. Do not wait for water to enter your home.</Text>
              </View>
            </View>

            {alert?.barangay_name ? (
              <View style={[styles.locationRow, compact && styles.locationRowCompact, { backgroundColor: dangerDark }]}>
                <MaterialCommunityIcons name="map-marker-alert" size={compact ? 17 : 20} color="#ffffff" />
                <View>
                  <Text style={styles.locationCaption}>AFFECTED AREA</Text>
                  <Text style={[styles.location, compact && styles.locationCompact]}>Barangay {alert.barangay_name}</Text>
                </View>
              </View>
            ) : null}
            <View style={styles.timeRow}>
              <MaterialCommunityIcons name="clock-alert-outline" size={15} color="#667085" />
              <Text style={styles.time}>Issued {alert ? new Date(alert.created_at).toLocaleString() : ''}</Text>
            </View>

            <View style={[styles.actionRow, compact && styles.actionRowCompact]}>
              <TouchableOpacity accessibilityRole="button" activeOpacity={0.82} style={[styles.button, styles.rescueButton, compact && styles.rescueButtonCompact, { backgroundColor: accent }]} onPress={sendRescue}>
                <MaterialCommunityIcons name="alarm-light" size={compact ? 19 : 22} color="#ffffff" />
                <View style={styles.rescueButtonCopy}>
                  <Text style={[styles.buttonText, styles.rescueButtonText, compact && styles.buttonTextCompact]}>SEND RESCUE NOW</Text>
                  {!compact ? <Text style={styles.rescueButtonHint}>I cannot evacuate safely</Text> : null}
                </View>
                {!compact ? <MaterialCommunityIcons name="chevron-right" size={24} color="#ffffff" /> : null}
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" activeOpacity={0.82} style={[styles.button, styles.acknowledgeButton, compact && styles.acknowledgeButtonCompact]} onPress={dismiss}>
                <MaterialCommunityIcons name="check-circle-outline" size={compact ? 17 : 19} color="#475467" />
                <Text style={[styles.acknowledgeText, compact && styles.acknowledgeTextCompact]}>Acknowledge</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18, backgroundColor: 'rgba(2,6,23,.76)' },
  backdropCompact: { padding: 8 },
  card: { width: '100%', maxWidth: 390, overflow: 'hidden', borderWidth: 2, borderRadius: 20, backgroundColor: editorial.surface, shadowColor: '#000000', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 24 },
  cardCompact: { borderRadius: 16 },
  emergencyHeader: { width: '100%', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 18, paddingTop: 22 },
  emergencyHeaderCompact: { paddingBottom: 10, paddingTop: 11 },
  iconStage: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center' },
  pulseRing: { position: 'absolute', width: 70, height: 70, borderRadius: 35, backgroundColor: '#fda29b' },
  emergencyIcon: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center', borderRadius: 31, borderWidth: 4, borderColor: '#ffffff', backgroundColor: '#ffffff' },
  emergencyIconCompact: { width: 44, height: 44, borderRadius: 22, borderWidth: 3 },
  emergencyLabel: { marginTop: 8, color: '#ffffff', fontSize: 17, fontWeight: '900', letterSpacing: 1.4, textAlign: 'center' },
  emergencyLabelCompact: { marginTop: -7, fontSize: 14, letterSpacing: 1 },
  risingRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  risingRowCompact: { marginTop: 4 },
  risingText: { color: '#fecaca', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  risingTextCompact: { fontSize: 9, letterSpacing: 0.8 },
  content: { width: '100%', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 16, paddingTop: 17 },
  contentCompact: { paddingHorizontal: 12, paddingBottom: 11, paddingTop: 10 },
  severityBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  severityDot: { width: 8, height: 8, borderRadius: 4 },
  level: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  title: { marginTop: 12, fontSize: 25, lineHeight: 31, fontWeight: '900', textAlign: 'center', paddingHorizontal: 8 },
  titleCompact: { marginTop: 7, fontSize: 20, lineHeight: 24 },
  body: { color: '#344054', fontSize: 14, lineHeight: 21, fontWeight: '600', textAlign: 'center', marginTop: 9 },
  bodyCompact: { fontSize: 12, lineHeight: 16, marginTop: 5 },
  instructionBox: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 15, borderLeftWidth: 5, borderRadius: 10, backgroundColor: '#fff1f0', paddingHorizontal: 13, paddingVertical: 11 },
  instructionBoxCompact: { gap: 8, marginTop: 8, paddingHorizontal: 10, paddingVertical: 7 },
  instructionCopy: { flex: 1 },
  instructionTitle: { fontSize: 13, fontWeight: '900', letterSpacing: 0.8 },
  instructionText: { marginTop: 2, color: '#475467', fontSize: 11, lineHeight: 16, fontWeight: '600' },
  instructionTextCompact: { fontSize: 10, lineHeight: 13 },
  locationRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 12, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 10 },
  locationRowCompact: { gap: 7, marginTop: 7, paddingHorizontal: 10, paddingVertical: 6 },
  locationCaption: { color: '#fecaca', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  location: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  locationCompact: { fontSize: 12 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 9 },
  time: { color: '#667085', fontSize: 10, fontWeight: '600' },
  actionRow: { width: '100%', gap: 9, marginTop: 15 },
  actionRowCompact: { flexDirection: 'row', gap: 7, marginTop: 8 },
  button: { width: '100%', minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 11 },
  rescueButton: { minHeight: 58, justifyContent: 'space-between', shadowColor: '#7a271a', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  rescueButtonCompact: { flex: 1.25, minHeight: 46, justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 7 },
  rescueButtonCopy: { flex: 1 },
  rescueButtonText: { color: '#ffffff' },
  rescueButtonHint: { marginTop: 1, color: '#fee4e2', fontSize: 10, fontWeight: '600' },
  acknowledgeButton: { borderWidth: 1, borderColor: '#d0d5dd', backgroundColor: '#f9fafb' },
  acknowledgeButtonCompact: { flex: 1, minHeight: 46, paddingHorizontal: 7, paddingVertical: 7 },
  acknowledgeText: { color: '#475467', fontSize: 13, fontWeight: '800' },
  acknowledgeTextCompact: { fontSize: 11 },
  buttonText: { fontSize: 15, fontWeight: '900', letterSpacing: 0.3 },
  buttonTextCompact: { fontSize: 11, letterSpacing: 0 },
});
