import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppText as Text, AppTextInput as TextInput } from '../components/Typography';
import { DashboardHeader } from '../components/DashboardHeader';
import { editorial } from '../components/EditorialTheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { postAuth } from '../services/api';
import { SessionData } from '../services/session';
import { useResponsiveLayout } from '../utils/responsive';

type Props = {
  onRegisterSuccess: (session: SessionData) => Promise<void>;
  onShowLogin: () => void;
};

const BARANGAYS = ['Palingon', 'Sampiruhan', 'Lingga', 'Parian', 'Looc', 'Uwisan'] as const;

type FieldProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words';
  trailing?: ReactNode;
};

function Field({ icon, trailing, ...props }: FieldProps) {
  return (
    <View style={styles.inputWrap}>
      <MaterialCommunityIcons name={icon} size={16} color={editorial.accent} />
      <TextInput {...props} placeholderTextColor="#526170" style={styles.input} />
      {trailing}
    </View>
  );
}

export default function RegisterScreen({ onRegisterSuccess, onShowLogin }: Props) {
  const { isSmall } = useResponsiveLayout();
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [barangayName, setBarangayName] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [showBarangays, setShowBarangays] = useState(false);
  const [contactNumber, setContactNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [verificationVisible, setVerificationVisible] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateEmail(value: string) {
    setEmail(value);
    setOtp('');
    setOtpSent(false);
    setVerificationVisible(false);
    setVerificationError(null);
    setNotice(null);
  }

  async function sendRegistrationOtp() {
    setOtpSending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await postAuth('/auth/registration-otp', { email: email.trim() });
      setOtpSent(true);
      setNotice(response.data?.message || 'A verification code was sent to your email.');
      setVerificationError(null);
      setVerificationVisible(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Unable to send the verification code.');
    } finally {
      setOtpSending(false);
    }
  }

  async function onRegister() {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password || !barangayName || !houseNumber.trim() || !streetAddress.trim()) {
      setError('Please fill in all required fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (contactNumber && !/^\d+$/.test(contactNumber)) {
      setError('Contact number must contain numbers only.');
      return;
    }
    if (!otpSent) {
      await sendRegistrationOtp();
      return;
    }
    setVerificationError(null);
    setVerificationVisible(true);
  }

  async function completeRegistration() {
    if (!/^\d{6}$/.test(otp)) {
      setVerificationError('Enter the 6-digit verification code sent to your email.');
      return;
    }

    setLoading(true);
    setVerificationError(null);
    try {
      const res = await postAuth('/auth/register', {
        username: username.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        address: `${houseNumber.trim()} ${streetAddress.trim()}, Barangay ${barangayName}`,
        houseNumber: houseNumber.trim(),
        streetAddress: streetAddress.trim(),
        barangayName,
        contactNumber: contactNumber.trim(),
        otp,
      });
      const nextSession = res.data as SessionData;
      if (!nextSession?.token || !nextSession.user || nextSession.user.role !== 'user') {
        setVerificationError('Registration failed for user account.');
        return;
      }
      const accountId = nextSession.user.accountId || 'your new Account ID';
      const credentialEmailSent = res.data?.credentialEmailSent !== false;
      Alert.alert(
        'Account created',
        credentialEmailSent
          ? `Your login details and Account ID (${accountId}) were sent to ${email.trim()}. Use your email address to sign in.`
          : `Your account was created as ${accountId}, but the credentials email could not be delivered. Use ${email.trim()} to sign in.`,
      );
      await onRegisterSuccess(nextSession);
    } catch (err: any) {
      if (err?.code === 'ECONNABORTED' || err?.message?.toLowerCase?.().includes('network')) {
        setVerificationError('Cannot reach the server. Check your connection and try again.');
      } else {
        setVerificationError(err?.response?.data?.message || 'Unable to register right now.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.root}>
      <DashboardHeader />
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" bounces={false}>
          <View style={styles.form}>
            <Text style={styles.title}>Create your Account</Text>
            <Text style={styles.sectionLabel}>Register</Text>

            <Field icon="account-outline" value={username} onChangeText={setUsername} placeholder="Username" autoCapitalize="none" />
            <View style={[styles.nameRow, isSmall && styles.nameRowSmall]}>
              <View style={styles.nameField}><Field icon="account-outline" value={firstName} onChangeText={setFirstName} placeholder="First Name *" autoCapitalize="words" /></View>
              <View style={styles.nameField}><Field icon="account-outline" value={lastName} onChangeText={setLastName} placeholder="Last Name *" autoCapitalize="words" /></View>
            </View>
            <Field icon="email-outline" value={email} onChangeText={updateEmail} placeholder="Email *" keyboardType="email-address" autoCapitalize="none" />
            <TouchableOpacity style={styles.inputWrap} onPress={() => setShowBarangays((value) => !value)} activeOpacity={0.8}>
              <MaterialCommunityIcons name="map-marker-outline" size={16} color={editorial.accent} />
              <Text style={[styles.selectText, !barangayName && styles.selectPlaceholder]}>{barangayName || 'Select Barangay *'}</Text>
              <MaterialCommunityIcons name={showBarangays ? 'chevron-up' : 'chevron-down'} size={18} color="#526170" />
            </TouchableOpacity>
            {showBarangays ? (
              <View style={styles.barangayOptions}>
                {BARANGAYS.map((barangay) => (
                  <TouchableOpacity
                    key={barangay}
                    style={[styles.barangayOption, barangayName === barangay && styles.barangayOptionSelected]}
                    onPress={() => { setBarangayName(barangay); setShowBarangays(false); }}
                  >
                    <Text style={[styles.barangayOptionText, barangayName === barangay && styles.barangayOptionTextSelected]}>{barangay}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <View style={[styles.nameRow, isSmall && styles.nameRowSmall]}>
              <View style={styles.houseField}><Field icon="home-outline" value={houseNumber} onChangeText={setHouseNumber} placeholder="House No. *" autoCapitalize="words" /></View>
              <View style={styles.streetField}><Field icon="road-variant" value={streetAddress} onChangeText={setStreetAddress} placeholder="Street Address *" autoCapitalize="words" /></View>
            </View>
            <Field icon="phone-outline" value={contactNumber} onChangeText={(value) => setContactNumber(value.replace(/\D/g, ''))} placeholder="Contact Number" keyboardType="phone-pad" />
            <Field
              icon="lock-outline" value={password} onChangeText={setPassword} placeholder="Password *" secureTextEntry={!showPassword}
              trailing={<TouchableOpacity onPress={() => setShowPassword((value) => !value)}><MaterialCommunityIcons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={16} color="#526170" /></TouchableOpacity>}
            />
            <Field
              icon="lock-check-outline" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm Password *" secureTextEntry={!showConfirmPassword}
              trailing={<TouchableOpacity onPress={() => setShowConfirmPassword((value) => !value)}><MaterialCommunityIcons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={16} color="#526170" /></TouchableOpacity>}
            />

            <Text style={styles.locationHint}>After verification, your Account ID and login details will be sent to this address. Residents sign in using their email.</Text>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity style={styles.primaryButton} onPress={onRegister} disabled={loading || otpSending} activeOpacity={0.85}>
              {otpSending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Create Account</Text>}
            </TouchableOpacity>
            <View style={styles.footerRow}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <TouchableOpacity onPress={onShowLogin}><Text style={styles.footerLink}>Login</Text></TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={verificationVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => { if (!loading) setVerificationVisible(false); }}
      >
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <MaterialCommunityIcons name="email-check-outline" size={28} color={editorial.accent} />
            </View>
            <Text style={styles.modalTitle}>Verify your email</Text>
            <Text style={styles.modalDescription}>Enter the 6-digit verification code sent to {email.trim()}.</Text>
            {notice ? <Text style={styles.noticeText}>{notice}</Text> : null}
            <Field
              icon="shield-key-outline"
              value={otp}
              onChangeText={(value) => { setOtp(value.replace(/\D/g, '').slice(0, 6)); setVerificationError(null); }}
              placeholder="6-digit email code"
              keyboardType="phone-pad"
            />
            {verificationError ? <Text style={styles.modalErrorText}>{verificationError}</Text> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setVerificationVisible(false)} disabled={loading}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalVerifyButton} onPress={completeRegistration} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalVerifyText}>Verify & Create</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  keyboard: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 24, backgroundColor: editorial.background },
  form: { width: '100%', maxWidth: 420, padding: 18, borderRadius: 14, backgroundColor: editorial.surface, borderWidth: 1, borderColor: editorial.border },
  title: { color: editorial.ink, fontSize: 25, textAlign: 'left', lineHeight: 30, marginBottom: 18 },
  sectionLabel: { color: editorial.ink, fontSize: 14, fontWeight: '400', marginLeft: 8, marginBottom: 8 },
  inputWrap: {
    height: 42, borderWidth: 1, borderColor: editorial.border, borderRadius: 10, paddingHorizontal: 13,
    flexDirection: 'row', alignItems: 'center', marginBottom: 8, backgroundColor: '#fff',
  },
  input: { flex: 1, color: '#111111', fontSize: 12, marginLeft: 7, paddingVertical: 0, minWidth: 0 },
  nameRow: { flexDirection: 'row', gap: 7 },
  nameRowSmall: { flexDirection: 'column', gap: 0 },
  nameField: { flex: 1, minWidth: 0 },
  houseField: { flex: 0.72, minWidth: 0 },
  streetField: { flex: 1.28, minWidth: 0 },
  selectText: { flex: 1, color: '#111111', fontSize: 12, marginLeft: 7 },
  selectPlaceholder: { color: '#526170' },
  barangayOptions: { marginTop: -3, marginBottom: 8, padding: 5, borderWidth: 1, borderColor: editorial.border, borderRadius: 10, backgroundColor: '#fff' },
  barangayOption: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 7 },
  barangayOptionSelected: { backgroundColor: '#fff0eb' },
  barangayOptionText: { color: '#26384a', fontSize: 12 },
  barangayOptionTextSelected: { color: editorial.accent, fontWeight: '800' },
  locationHint: { color: '#555555', fontSize: 10, marginHorizontal: 8, marginBottom: 8 },
  noticeText: { color: '#15803d', fontSize: 11, marginHorizontal: 8, marginBottom: 8 },
  errorText: { color: '#c62828', fontSize: 11, marginHorizontal: 8, marginBottom: 8 },
  primaryButton: { height: 45, borderRadius: 10, backgroundColor: editorial.accent, alignItems: 'center', justifyContent: 'center', marginTop: 2, marginBottom: 10 },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  footerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { color: '#555555', fontSize: 10 },
  footerLink: { color: editorial.accent, fontSize: 10, fontWeight: '900' },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(15, 23, 42, 0.62)' },
  modalCard: { width: '100%', maxWidth: 390, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: editorial.border, backgroundColor: '#fff' },
  modalIcon: { width: 52, height: 52, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: 26, backgroundColor: '#fff0eb', marginBottom: 12 },
  modalTitle: { color: editorial.ink, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  modalDescription: { color: '#526170', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6, marginBottom: 14 },
  modalErrorText: { color: '#c62828', fontSize: 11, marginBottom: 10 },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  modalCancelButton: { flex: 1, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: editorial.border, backgroundColor: '#fff' },
  modalCancelText: { color: '#526170', fontSize: 12, fontWeight: '800' },
  modalVerifyButton: { flex: 1.5, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: editorial.accent },
  modalVerifyText: { color: '#fff', fontSize: 12, fontWeight: '900' },
});
