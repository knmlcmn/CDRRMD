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
import { AuthShell, authColors } from '../components/AuthShell';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { postAuth } from '../services/api';
import { SessionData } from '../services/session';

type Props = {
  onLoginSuccess: (session: SessionData) => Promise<void>;
  onShowRegister: () => void;
  onForgotPassword: () => void;
};

export default function LoginScreen({ onLoginSuccess, onShowRegister, onForgotPassword }: Props) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<'identifier' | 'password' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLogin() {
    if (!identifier.trim() || !password) {
      setError('Please enter your email or responder Account ID and password.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const normalizedIdentifier = identifier.trim();
      const isEmail = normalizedIdentifier.includes('@');
      const loginIdentifier = isEmail ? normalizedIdentifier.toLowerCase() : normalizedIdentifier.toUpperCase();
      const res = await postAuth('/auth/login', {
        identifier: loginIdentifier,
        ...(isEmail ? { email: loginIdentifier } : { accountId: loginIdentifier }),
        password,
      });
      const nextSession = res.data as SessionData;
      const allowedRole = ['user', 'rescuer', 'barangay_rescuer'].includes(nextSession?.user?.role || '');
      if (!nextSession?.user || !allowedRole) {
        setError('This account cannot use the CDRRMD app.');
        return;
      }
      await onLoginSuccess(nextSession);
    } catch (err: any) {
      if (err?.code === 'ECONNABORTED' || err?.message?.toLowerCase?.().includes('network')) {
        setError('Cannot reach the server. Check your connection and try again.');
      } else {
        setError(err?.response?.data?.message || err?.message || 'Invalid email, Account ID, or password.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell centerContent title="Welcome back" subtitle="Sign in as a resident or authorized emergency responder.">
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" bounces={false} showsVerticalScrollIndicator={false}>
          <View style={styles.form}>
            <Text style={styles.sectionLabel}>Account credentials</Text>

            <View style={[styles.inputWrap, focusedField === 'identifier' && styles.inputWrapFocused]}>
              <MaterialCommunityIcons name="account-outline" size={19} color={authColors.blue} />
              <TextInput
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="Resident email or responder Account ID"
                placeholderTextColor="#526170"
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                returnKeyType="next"
                accessibilityLabel="Resident email or responder Account ID"
                onFocus={() => setFocusedField('identifier')}
                onBlur={() => setFocusedField(null)}
              />
            </View>

            <View style={[styles.inputWrap, focusedField === 'password' && styles.inputWrapFocused]}>
              <MaterialCommunityIcons name="lock-outline" size={19} color={authColors.blue} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor="#526170"
                style={styles.input}
                secureTextEntry={!showPassword}
                onSubmitEditing={onLogin}
                accessibilityLabel="Password"
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
              />
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} hitSlop={10} onPress={() => setShowPassword((value) => !value)}>
                <MaterialCommunityIcons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={17} color="#526170" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.forgotButton} onPress={onForgotPassword}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            {error ? <View accessibilityRole="alert" style={styles.errorBox}><MaterialCommunityIcons name="alert-circle-outline" size={17} color={authColors.danger} /><Text style={styles.errorText}>{error}</Text></View> : null}

            <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: loading, busy: loading }} style={[styles.primaryButton, loading && styles.buttonDisabled]} onPress={onLogin} disabled={loading} activeOpacity={0.85}>
              {loading ? <ActivityIndicator color="#fff" /> : <><Text style={styles.primaryButtonText}>Sign in securely</Text><MaterialCommunityIcons name="arrow-right" size={18} color="#fff" /></>}
            </TouchableOpacity>

            <View style={styles.footerRow}>
              <Text style={styles.footerText}>No account yet? </Text>
              <TouchableOpacity onPress={onShowRegister}>
                <Text style={styles.footerLink}>Create Account</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  keyboard: { width: '100%' },
  scroll: { paddingBottom: 2 },
  form: { width: '100%', padding: 18, borderRadius: 18, backgroundColor: authColors.white, borderWidth: 1, borderColor: authColors.border, shadowColor: authColors.navy, shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  sectionLabel: { color: authColors.ink, fontSize: 12, lineHeight: 16, fontWeight: '900', marginBottom: 10, letterSpacing: 0.25 },
  inputWrap: {
    minHeight: 50, borderWidth: 1, borderColor: authColors.border, borderRadius: 12, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', marginBottom: 11, backgroundColor: '#fafdff',
  },
  inputWrapFocused: { borderColor: authColors.blue, borderWidth: 2, backgroundColor: '#ffffff' },
  input: { flex: 1, color: authColors.ink, fontSize: 13, marginLeft: 9, paddingVertical: 0 },
  forgotButton: { alignSelf: 'flex-end', marginRight: 8, marginBottom: 18 },
  forgotText: { color: authColors.blue, fontSize: 11, fontWeight: '900' },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, marginBottom: 11, borderRadius: 10, borderWidth: 1, borderColor: '#fac5c8', backgroundColor: '#fff3f3' },
  errorText: { flex: 1, color: authColors.danger, fontSize: 11, lineHeight: 16 },
  primaryButton: { height: 50, flexDirection: 'row', gap: 8, borderRadius: 12, backgroundColor: authColors.blue, alignItems: 'center', justifyContent: 'center', marginBottom: 14, shadowColor: authColors.navy, shadowOpacity: 0.18, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  buttonDisabled: { opacity: 0.62 },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  footerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { color: '#555555', fontSize: 11 },
  footerLink: { color: authColors.blue, fontSize: 11, fontWeight: '900' },
});
