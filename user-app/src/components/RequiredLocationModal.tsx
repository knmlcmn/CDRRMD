import { ActivityIndicator, Linking, Modal, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppText as Text } from './Typography';
import { editorial } from './EditorialTheme';

type Props = {
  loading: boolean;
  message?: string | null;
  activeSession?: boolean;
  testModeEnabled: boolean;
  onEnable: () => void;
  onToggleTestMode: () => void;
};

export default function RequiredLocationModal({ loading, message, activeSession = false, testModeEnabled, onEnable, onToggleTestMode }: Props) {
  async function openSettings() {
    try {
      await Linking.openSettings();
    } catch {
      // Instructions remain visible if settings cannot be opened directly.
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}} statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="map-marker-radius" size={38} color={editorial.accent} />
          </View>
          <Text style={styles.title}>{activeSession ? 'Keep your location on' : 'Location access required'}</Text>
          <Text style={styles.message}>
            {activeSession
              ? 'Your location was turned off or became unavailable. Turn it back on to safely use the app and determine the barangay handling your current activity.'
              : 'Turn on location to continue. We use your live position to determine the barangay handling your current activity.'}
          </Text>
          <Text style={styles.supported}>Sampiruhan · Lingga · Palingon · Parian · Uwisan · Looc</Text>
          {message ? <Text style={styles.error}>{message}</Text> : null}
          <TouchableOpacity style={styles.primaryButton} onPress={onEnable} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : (
              <>
                <MaterialCommunityIcons name="crosshairs-gps" size={18} color="#fff" />
                <Text style={styles.primaryText}>{Platform.OS === 'web' ? 'Allow Location' : 'Try Again'}</Text>
              </>
            )}
          </TouchableOpacity>
          {message && Platform.OS !== 'web' ? (
            <TouchableOpacity style={styles.settingsButton} onPress={openSettings} disabled={loading}>
              <Text style={styles.settingsText}>Open Location Settings</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={[styles.testModeButton, testModeEnabled && styles.testModeButtonEnabled]} onPress={onToggleTestMode} disabled={loading}>
            <MaterialCommunityIcons name={testModeEnabled ? 'toggle-switch' : 'toggle-switch-off-outline'} size={24} color={testModeEnabled ? '#991b1b' : '#475569'} />
            <View style={styles.testModeCopy}>
              <Text style={styles.testModeTitle}>Test Mode: {testModeEnabled ? 'On' : 'Off'}</Text>
              <Text style={styles.testModeHelp}>Allows app access outside the six barangays for testing.</Text>
            </View>
          </TouchableOpacity>
          <Text style={styles.requiredNote}>
            {activeSession
              ? 'App access will resume as soon as a live location is detected.'
              : 'You will remain on the login screen until live location is enabled.'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.62)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  card: { width: '100%', maxWidth: 410, borderRadius: 14, backgroundColor: editorial.surface, paddingHorizontal: 24, paddingVertical: 28, alignItems: 'center' },
  iconCircle: { width: 70, height: 70, borderRadius: 35, backgroundColor: editorial.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { color: editorial.ink, fontSize: 24, fontWeight: '400', textAlign: 'center' },
  message: { color: editorial.muted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 10 },
  supported: { color: editorial.accent, fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 12 },
  error: { color: '#b91c1c', backgroundColor: '#fef2f2', borderRadius: 10, padding: 10, fontSize: 12, lineHeight: 17, width: '100%', marginTop: 14 },
  primaryButton: { width: '100%', height: 48, borderRadius: 10, backgroundColor: editorial.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 20 },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  settingsButton: { marginTop: 12, paddingVertical: 7 },
  settingsText: { color: editorial.accent, fontSize: 12, fontWeight: '800', textDecorationLine: 'underline' },
  testModeButton: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 10, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#f8fafc' },
  testModeButtonEnabled: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  testModeCopy: { flex: 1 },
  testModeTitle: { color: editorial.ink, fontSize: 12, fontWeight: '800' },
  testModeHelp: { color: '#64748b', fontSize: 10, lineHeight: 14, marginTop: 2 },
  requiredNote: { color: '#64748b', fontSize: 10, textAlign: 'center', marginTop: 14 },
});
