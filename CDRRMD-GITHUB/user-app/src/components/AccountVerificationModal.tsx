import { useState } from 'react';
import { ActivityIndicator, Linking, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { AppText as Text } from './Typography';
import { editorial } from './EditorialTheme';
import { resubmitAuthVerification } from '../services/api';
import { SessionUser } from '../services/session';

type Props = {
  status: 'pending' | 'disapproved';
  onLogout: () => void | Promise<void>;
  onResubmitted: (user: SessionUser) => void | Promise<void>;
};

export default function AccountVerificationModal({ status, onLogout, onResubmitted }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resubmitId() {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Please allow photo access to upload a new valid ID.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.65,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    if (!asset.base64) {
      setError('The selected ID image could not be read. Please select another image.');
      return;
    }

    setSubmitting(true);
    try {
      const mimeType = asset.mimeType || 'image/jpeg';
      const response = await resubmitAuthVerification(`data:${mimeType};base64,${asset.base64}`);
      const user = response.data?.user as SessionUser | undefined;
      if (!user?.id) throw new Error('The verification request could not be updated.');
      await onResubmitted(user);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || requestError?.message || 'Unable to resubmit your valid ID.');
    } finally {
      setSubmitting(false);
    }
  }

  async function contactUs() {
    const subject = encodeURIComponent('CDRRMD account verification assistance');
    await Linking.openURL(`mailto:cdrrmd.admin@calamba.gov.ph?subject=${subject}`).catch(() => {
      setError('Please email cdrrmd.admin@calamba.gov.ph for verification assistance.');
    });
  }

  const pending = status === 'pending';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}} statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={[styles.iconCircle, !pending && styles.disapprovedIcon]}>
            <MaterialCommunityIcons name={pending ? 'clock-time-four-outline' : 'account-alert-outline'} size={42} color={pending ? editorial.accent : '#b91c1c'} />
          </View>
          <Text style={styles.title}>{pending ? "Waiting for administrator approval" : 'Account verification was not approved'}</Text>
          <Text style={styles.message}>
            {pending
              ? 'Your account details and valid ID were submitted successfully. An administrator must verify your account before you can use the app. This usually takes 1-3 days.'
              : 'The administrator could not approve your submitted ID. Upload a clearer or updated valid ID to request another review, or contact CDRRMD for help.'}
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {pending ? (
            <TouchableOpacity style={styles.logoutButton} onPress={onLogout} disabled={submitting}>
              <MaterialCommunityIcons name="logout" size={18} color="#fff" />
              <Text style={styles.logoutText}>Log Out</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.actions}>
              <TouchableOpacity style={styles.primaryButton} onPress={resubmitId} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff" /> : <>
                  <MaterialCommunityIcons name="card-account-details-outline" size={18} color="#fff" />
                  <Text style={styles.primaryText}>Resubmit Valid ID</Text>
                </>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.contactButton} onPress={contactUs} disabled={submitting}>
                <MaterialCommunityIcons name="email-outline" size={18} color={editorial.accent} />
                <Text style={styles.contactText}>Contact Us</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.disapprovedLogout} onPress={onLogout} disabled={submitting}>
                <Text style={styles.disapprovedLogoutText}>Log Out</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.68)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  card: { width: '100%', maxWidth: 420, borderRadius: 16, backgroundColor: '#fff', paddingHorizontal: 25, paddingVertical: 28, alignItems: 'center' },
  iconCircle: { width: 76, height: 76, borderRadius: 38, backgroundColor: editorial.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  disapprovedIcon: { backgroundColor: '#fef2f2' },
  title: { color: editorial.ink, fontSize: 22, lineHeight: 28, fontWeight: '800', textAlign: 'center' },
  message: { color: editorial.muted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 11 },
  error: { width: '100%', color: '#b91c1c', backgroundColor: '#fef2f2', borderRadius: 9, padding: 10, fontSize: 12, lineHeight: 17, marginTop: 14 },
  logoutButton: { width: '100%', height: 48, borderRadius: 10, backgroundColor: '#dc2626', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 22 },
  logoutText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  actions: { width: '100%', marginTop: 20, gap: 10 },
  primaryButton: { height: 48, borderRadius: 10, backgroundColor: editorial.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  contactButton: { height: 46, borderRadius: 10, borderWidth: 1, borderColor: editorial.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  contactText: { color: editorial.accent, fontSize: 14, fontWeight: '800' },
  disapprovedLogout: { alignItems: 'center', paddingVertical: 8 },
  disapprovedLogoutText: { color: '#64748b', fontSize: 12, fontWeight: '800', textDecorationLine: 'underline' },
});
