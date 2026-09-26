import { useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { assignAuthBarangayFromLocation } from '../services/api';
import { SessionUser } from '../services/session';

type Props = {
  onAssigned: (user: SessionUser) => Promise<void>;
};

export default function RequiredLocationModal({ onAssigned }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enableLocation() {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setError('Location access is required to use the application. Enable it in your browser or device settings, then try again.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const response = await assignAuthBarangayFromLocation(
        position.coords.latitude,
        position.coords.longitude,
      );
      const user = response.data?.user as SessionUser | undefined;
      if (!user?.id || !user.barangayName) {
        throw new Error('The nearest barangay could not be assigned.');
      }
      await onAssigned(user);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Unable to verify your location. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function openSettings() {
    try {
      if (Platform.OS === 'web') {
        setError('Use the location icon beside your browser address bar to allow location, then press Try Again.');
      } else {
        await Linking.openSettings();
      }
    } catch {
      setError('Please open your device settings and allow location access for this application.');
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}} statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="map-marker-radius" size={38} color="#15364a" />
          </View>
          <Text style={styles.title}>Location access required</Text>
          <Text style={styles.message}>
            Turn on location to continue. We use your current position to assign your account to the nearest supported barangay.
          </Text>
          <Text style={styles.supported}>Sampiruhan · Lingga · Palingon · Parian · Uwisan · Looc</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity style={styles.primaryButton} onPress={enableLocation} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : (
              <>
                <MaterialCommunityIcons name="crosshairs-gps" size={18} color="#fff" />
                <Text style={styles.primaryText}>{error ? 'Try Again' : 'Enable Location'}</Text>
              </>
            )}
          </TouchableOpacity>
          {error ? (
            <TouchableOpacity style={styles.settingsButton} onPress={openSettings} disabled={loading}>
              <Text style={styles.settingsText}>Open Location Settings</Text>
            </TouchableOpacity>
          ) : null}
          <Text style={styles.requiredNote}>Location must be enabled before the application can be accessed.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.62)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  card: { width: '100%', maxWidth: 410, borderRadius: 22, backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 28, alignItems: 'center', elevation: 12 },
  iconCircle: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#eaf1f5', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { color: '#102e46', fontSize: 21, fontWeight: '900', textAlign: 'center' },
  message: { color: '#475569', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 10 },
  supported: { color: '#15364a', fontSize: 11, fontWeight: '800', textAlign: 'center', marginTop: 12 },
  error: { color: '#b91c1c', backgroundColor: '#fef2f2', borderRadius: 10, padding: 10, fontSize: 12, lineHeight: 17, width: '100%', marginTop: 14 },
  primaryButton: { width: '100%', height: 48, borderRadius: 24, backgroundColor: '#15364a', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 20 },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  settingsButton: { marginTop: 12, paddingVertical: 7 },
  settingsText: { color: '#15364a', fontSize: 12, fontWeight: '800', textDecorationLine: 'underline' },
  requiredNote: { color: '#64748b', fontSize: 10, textAlign: 'center', marginTop: 14 },
});
