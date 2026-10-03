import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
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
};

export default function ResidentFloodAlert({ onTestAccountRemoved }: Props) {
  const [alert, setAlert] = useState<FloodNotification | null>(null);
  const coordinatesRef = useRef<{ latitude: number; longitude: number } | null>(null);

  const checkAlerts = useCallback(async () => {
    const response = await api.get('/reports/notifications/mine', {
      params: coordinatesRef.current || undefined,
    });
    const notifications = Array.isArray(response.data) ? response.data as FloodNotification[] : [];
    const latestUnread = notifications.find(
      (item) => item.category === 'flood_sensor' && !item.read_at && item.matches_current_location !== false,
    );
    setAlert((current) => current || latestUnread || null);
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
    return () => {
      active = false;
      clearInterval(timer);
      locationSubscription?.remove();
    };
  }, [checkAlerts]);

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

  const high = String(alert?.severity || '').toLowerCase() === 'high';
  const accent = high ? '#d92d20' : '#d97706';

  return (
    <Modal visible={Boolean(alert)} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal accessibilityLiveRegion="assertive">
          <View style={[styles.iconCircle, { backgroundColor: high ? '#fee4e2' : '#fef3c7' }]}>
            <MaterialCommunityIcons name="waves-arrow-up" size={28} color={accent} />
          </View>
          <Text style={[styles.level, { color: accent }]}>{high ? 'HIGH WATER LEVEL' : 'MEDIUM WATER LEVEL'}</Text>
          <Text style={styles.title}>{alert?.title}</Text>
          <Text style={styles.body}>{alert?.body}</Text>
          {alert?.barangay_name ? (
            <View style={styles.locationRow}>
              <MaterialCommunityIcons name="map-marker" size={16} color="#475467" />
              <Text style={styles.location}>Barangay {alert.barangay_name}</Text>
            </View>
          ) : null}
          <Text style={styles.time}>{alert ? new Date(alert.created_at).toLocaleString() : ''}</Text>
          <TouchableOpacity accessibilityRole="button" style={[styles.button, { borderTopColor: high ? '#fda29b' : '#fcd34d' }]} onPress={dismiss}>
            <Text style={[styles.buttonText, { color: accent }]}>
              {alert?.is_test_account ? 'Got it — finish test' : 'Got it'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(15,23,42,.38)' },
  card: { width: '100%', maxWidth: 340, overflow: 'hidden', alignItems: 'center', borderRadius: 14, backgroundColor: editorial.surface, paddingTop: 22 },
  iconCircle: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginBottom: 11 },
  level: { fontSize: 11, fontWeight: '900', letterSpacing: 1.1, marginBottom: 7 },
  title: { color: editorial.ink, fontSize: 22, fontWeight: '400', textAlign: 'center', paddingHorizontal: 22 },
  body: { color: editorial.muted, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 24, marginTop: 9 },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 13, gap: 4 },
  location: { color: '#344054', fontSize: 13, fontWeight: '700' },
  time: { color: '#98a2b3', fontSize: 11, marginTop: 7, marginBottom: 17 },
  button: { width: '100%', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 13 },
  buttonText: { fontSize: 16, fontWeight: '800' },
});
