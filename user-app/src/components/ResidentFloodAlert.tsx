import { useCallback, useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
};

type Props = {
  onTestAccountRemoved?: () => Promise<void> | void;
};

export default function ResidentFloodAlert({ onTestAccountRemoved }: Props) {
  const [alert, setAlert] = useState<FloodNotification | null>(null);

  const checkAlerts = useCallback(async () => {
    const response = await api.get('/reports/notifications/mine');
    const notifications = Array.isArray(response.data) ? response.data as FloodNotification[] : [];
    const latestUnread = notifications.find(
      (item) => item.category === 'flood_sensor' && !item.read_at,
    );
    setAlert((current) => current || latestUnread || null);
  }, []);

  useEffect(() => {
    checkAlerts().catch(() => {});
    const timer = setInterval(() => checkAlerts().catch(() => {}), 8_000);
    return () => clearInterval(timer);
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
  card: { width: '100%', maxWidth: 340, overflow: 'hidden', alignItems: 'center', borderRadius: 20, backgroundColor: 'rgba(255,255,255,.98)', paddingTop: 22, shadowColor: '#000', shadowOpacity: .24, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 18 },
  iconCircle: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginBottom: 11 },
  level: { fontSize: 11, fontWeight: '900', letterSpacing: 1.1, marginBottom: 7 },
  title: { color: '#101828', fontSize: 18, fontWeight: '800', textAlign: 'center', paddingHorizontal: 22 },
  body: { color: '#475467', fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 24, marginTop: 9 },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 13, gap: 4 },
  location: { color: '#344054', fontSize: 13, fontWeight: '700' },
  time: { color: '#98a2b3', fontSize: 11, marginTop: 7, marginBottom: 17 },
  button: { width: '100%', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 13 },
  buttonText: { fontSize: 16, fontWeight: '800' },
});
