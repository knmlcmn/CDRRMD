import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { DashboardHeader } from '../components/DashboardHeader';
import { editorial } from '../components/EditorialTheme';
import { AppText as Text, AppTextInput as TextInput } from '../components/Typography';
import { postAuth } from '../services/api';

type Props = { onShowLogin: () => void };

export default function ForgotPasswordScreen({ onShowLogin }: Props) {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function requestCode() {
    if (!email.trim()) {
      setError('Enter the email address used for your account.');
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await postAuth('/auth/password-reset-otp', { email: email.trim() });
      setCodeSent(true);
      setMessage(response.data?.message || 'Check your email for the verification code.');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Unable to send the verification code.');
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword() {
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the 6-digit verification code.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await postAuth('/auth/password-reset', { email: email.trim(), otp, newPassword });
      setSuccess(true);
      setMessage(response.data?.message || 'Your password has been reset.');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Unable to reset your password.');
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
            <Text style={styles.title}>Recover your account</Text>
            <Text style={styles.description}>We will send a one-time verification code to your registered email address.</Text>

            {!success ? (
              <>
                <View style={styles.inputWrap}>
                  <MaterialCommunityIcons name="email-outline" size={17} color={editorial.accent} />
                  <TextInput value={email} onChangeText={(value) => { setEmail(value); setCodeSent(false); setOtp(''); }} placeholder="Registered email" placeholderTextColor="#526170" style={styles.input} autoCapitalize="none" keyboardType="email-address" editable={!loading} />
                </View>
                <TouchableOpacity style={styles.secondaryButton} onPress={requestCode} disabled={loading}>
                  {loading && !codeSent ? <ActivityIndicator size="small" color={editorial.accent} /> : <Text style={styles.secondaryButtonText}>{codeSent ? 'Resend Email Code' : 'Send Email Code'}</Text>}
                </TouchableOpacity>

                {codeSent ? (
                  <>
                    <View style={styles.inputWrap}><MaterialCommunityIcons name="shield-key-outline" size={17} color={editorial.accent} /><TextInput value={otp} onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit email code" placeholderTextColor="#526170" style={styles.input} keyboardType="phone-pad" /></View>
                    <View style={styles.inputWrap}><MaterialCommunityIcons name="lock-outline" size={17} color={editorial.accent} /><TextInput value={newPassword} onChangeText={setNewPassword} placeholder="New password" placeholderTextColor="#526170" style={styles.input} secureTextEntry /></View>
                    <View style={styles.inputWrap}><MaterialCommunityIcons name="lock-check-outline" size={17} color={editorial.accent} /><TextInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm new password" placeholderTextColor="#526170" style={styles.input} secureTextEntry /></View>
                  </>
                ) : null}
              </>
            ) : null}

            {message ? <Text style={styles.successText}>{message}</Text> : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {codeSent && !success ? <TouchableOpacity style={styles.primaryButton} onPress={resetPassword} disabled={loading}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Reset Password</Text>}</TouchableOpacity> : null}
            <TouchableOpacity style={success ? styles.primaryButton : styles.backButton} onPress={onShowLogin} disabled={loading}><Text style={success ? styles.primaryButtonText : styles.backText}>Back to Login</Text></TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  keyboard: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 30, backgroundColor: editorial.background },
  form: { width: '100%', maxWidth: 410, padding: 22, borderRadius: 14, backgroundColor: editorial.surface, borderWidth: 1, borderColor: editorial.border },
  title: { color: editorial.ink, fontSize: 24, lineHeight: 30, marginBottom: 8 },
  description: { color: '#526170', fontSize: 12, lineHeight: 18, marginBottom: 18 },
  inputWrap: { height: 45, borderWidth: 1, borderColor: editorial.border, borderRadius: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 10, backgroundColor: '#fff' },
  input: { flex: 1, color: '#111111', fontSize: 13, marginLeft: 8, paddingVertical: 0 },
  secondaryButton: { height: 42, borderWidth: 1, borderColor: editorial.accent, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 12, backgroundColor: '#f7fbfe' },
  secondaryButtonText: { color: editorial.accent, fontSize: 12, fontWeight: '900' },
  primaryButton: { height: 47, borderRadius: 10, backgroundColor: editorial.accent, alignItems: 'center', justifyContent: 'center', marginTop: 4, marginBottom: 10 },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  backButton: { alignItems: 'center', paddingVertical: 9 },
  backText: { color: editorial.accent, fontSize: 12, fontWeight: '800' },
  successText: { color: '#15803d', fontSize: 12, lineHeight: 18, marginBottom: 10 },
  errorText: { color: '#c62828', fontSize: 12, lineHeight: 18, marginBottom: 10 },
});
