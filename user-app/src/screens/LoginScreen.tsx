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
import { AppText as Text, AppTextInput as TextInput } from '../components/Typography';
import { DashboardHeader } from '../components/DashboardHeader';
import { editorial } from '../components/EditorialTheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { loginRescuer, postAuth } from '../services/api';
import { SessionData } from '../services/session';

type Props = {
  onLoginSuccess: (session: SessionData) => Promise<void>;
  onShowRegister: () => void;
  onForgotPassword: () => void;
};

export default function LoginScreen({ onLoginSuccess, onShowRegister, onForgotPassword }: Props) {
  const [identifier, setIdentifier] = useState('');
  const [loginType, setLoginType] = useState<'resident' | 'rescuer'>('resident');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLogin() {
    if (!identifier.trim() || !password) {
      setError(`Please enter your ${loginType === 'resident' ? 'email address' : 'Account ID'} and password.`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = loginType === 'resident'
        ? await postAuth('/auth/login', { email: identifier.trim().toLowerCase(), password })
        : await loginRescuer(identifier, password);
      const nextSession = res.data as SessionData;
      const allowedRole = loginType === 'resident'
        ? nextSession?.user?.role === 'user'
        : ['rescuer', 'barangay_rescuer'].includes(nextSession?.user?.role || '');
      if (!nextSession?.user || !allowedRole) {
        setError(`This account cannot use ${loginType === 'resident' ? 'Resident' : 'Rescuer'} login.`);
        return;
      }
      await onLoginSuccess(nextSession);
    } catch (err: any) {
      if (err?.code === 'ECONNABORTED' || err?.message?.toLowerCase?.().includes('network')) {
        setError('Cannot reach the server. Check your connection and try again.');
      } else {
        setError(err?.response?.data?.message || err?.message || `Invalid ${loginType === 'resident' ? 'email address' : 'Account ID'} or password.`);
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
            <Text style={styles.title}>Welcome back!</Text>
            <Text style={styles.sectionLabel}>Login</Text>

            <View style={styles.loginTypeRow}>
              {(['resident', 'rescuer'] as const).map((type) => (
                <TouchableOpacity
                  key={type}
                  accessibilityRole="button"
                  onPress={() => { setLoginType(type); setIdentifier(''); setError(null); }}
                  style={[styles.loginTypeButton, loginType === type && styles.loginTypeButtonActive]}
                >
                  <Text style={[styles.loginTypeText, loginType === type && styles.loginTypeTextActive]}>
                    {type === 'resident' ? 'Resident' : 'Rescuer'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.inputWrap}>
              <MaterialCommunityIcons name="account-outline" size={17} color={editorial.accent} />
              <TextInput
                value={identifier}
                onChangeText={setIdentifier}
                placeholder={loginType === 'resident' ? 'Email Address' : 'Account ID (RSC- or BRS-)'}
                placeholderTextColor="#526170"
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType={loginType === 'resident' ? 'email-address' : 'default'}
                returnKeyType="next"
              />
            </View>

            <View style={styles.inputWrap}>
              <MaterialCommunityIcons name="lock-outline" size={17} color={editorial.accent} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor="#526170"
                style={styles.input}
                secureTextEntry={!showPassword}
                onSubmitEditing={onLogin}
              />
              <TouchableOpacity accessibilityLabel="Show or hide password" onPress={() => setShowPassword((value) => !value)}>
                <MaterialCommunityIcons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={17} color="#526170" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.rememberRow} onPress={() => setRememberMe((value) => !value)}>
              <MaterialCommunityIcons name={rememberMe ? 'checkbox-marked' : 'checkbox-blank-outline'} size={16} color={editorial.accent} />
              <Text style={styles.rememberText}>Remember me</Text>
            </TouchableOpacity>

            {loginType === 'resident' ? (
              <TouchableOpacity style={styles.forgotButton} onPress={onForgotPassword}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            ) : null}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity style={styles.primaryButton} onPress={onLogin} disabled={loading} activeOpacity={0.85}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Login</Text>}
            </TouchableOpacity>

            {loginType === 'resident' ? <View style={styles.footerRow}>
              <Text style={styles.footerText}>No account yet? </Text>
              <TouchableOpacity onPress={onShowRegister}>
                <Text style={styles.footerLink}>Create Account</Text>
              </TouchableOpacity>
            </View> : null}
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
  form: { width: '100%', maxWidth: 390, padding: 22, borderRadius: 14, backgroundColor: editorial.surface, borderWidth: 1, borderColor: editorial.border },
  title: { color: editorial.ink, fontSize: 26, textAlign: 'left', marginBottom: 20, lineHeight: 31 },
  sectionLabel: { color: editorial.ink, fontSize: 14, fontWeight: '400', marginLeft: 8, marginBottom: 8 },
  loginTypeRow: { flexDirection: 'row', padding: 3, marginBottom: 14, borderRadius: 10, backgroundColor: '#e8eef3' },
  loginTypeButton: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  loginTypeButtonActive: { backgroundColor: editorial.accent },
  loginTypeText: { color: '#526170', fontSize: 12, fontWeight: '800' },
  loginTypeTextActive: { color: '#ffffff' },
  inputWrap: {
    height: 45, borderWidth: 1, borderColor: editorial.border, borderRadius: 10, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', marginBottom: 10, backgroundColor: '#fff',
  },
  input: { flex: 1, color: '#111111', fontSize: 13, marginLeft: 8, paddingVertical: 0 },
  rememberRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginLeft: 8, marginBottom: 18 },
  rememberText: { color: '#333333', fontSize: 11, marginLeft: 5 },
  forgotButton: { alignSelf: 'flex-end', marginTop: -33, marginRight: 8, marginBottom: 18 },
  forgotText: { color: editorial.accent, fontSize: 11, fontWeight: '800' },
  errorText: { color: '#c62828', fontSize: 12, marginHorizontal: 8, marginBottom: 10 },
  primaryButton: { height: 47, borderRadius: 10, backgroundColor: editorial.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  footerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { color: '#555555', fontSize: 11 },
  footerLink: { color: editorial.accent, fontSize: 11, fontWeight: '900' },
});
