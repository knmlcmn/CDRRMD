import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { postAuth } from '../services/api';
import { SessionData } from '../services/session';

type Props = {
  onLoginSuccess: (session: SessionData) => Promise<void>;
  onShowRegister: () => void;
};

export default function LoginScreen({ onLoginSuccess, onShowRegister }: Props) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLogin() {
    if (!identifier.trim() || !password) {
      setError('Please enter your username/email and password.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await postAuth('/auth/login', { email: identifier.trim(), password });
      const nextSession = res.data as SessionData;
      if (!nextSession?.user || nextSession.user.role !== 'user') {
        setError('This app is for user accounts only.');
        return;
      }
      await onLoginSuccess(nextSession);
    } catch (err: any) {
      if (err?.code === 'ECONNABORTED' || err?.message?.toLowerCase?.().includes('network')) {
        setError('Cannot reach the server. Check your connection and try again.');
      } else {
        setError(err?.response?.data?.message || 'Invalid username/email or password.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" bounces={false}>
          <View style={styles.form}>
            <Image source={require('../../assets/cdrrmd-logo.png')} style={styles.logo} resizeMode="contain" />
            <Text style={styles.title}>Welcome back!</Text>
            <Text style={styles.sectionLabel}>Login</Text>

            <View style={styles.inputWrap}>
              <MaterialCommunityIcons name="account-outline" size={17} color="#17324a" />
              <TextInput
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="Username or Email"
                placeholderTextColor="#526170"
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>

            <View style={styles.inputWrap}>
              <MaterialCommunityIcons name="lock-outline" size={17} color="#17324a" />
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
              <MaterialCommunityIcons name={rememberMe ? 'checkbox-marked' : 'checkbox-blank-outline'} size={16} color="#17324a" />
              <Text style={styles.rememberText}>Remember me</Text>
            </TouchableOpacity>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity style={styles.primaryButton} onPress={onLogin} disabled={loading} activeOpacity={0.85}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Login</Text>}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  keyboard: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 30 },
  form: { width: '100%', maxWidth: 390 },
  logo: { width: 96, height: 96, alignSelf: 'center', marginBottom: 25 },
  title: { color: '#102e46', fontSize: 21, fontWeight: '900', textAlign: 'center', marginBottom: 24 },
  sectionLabel: { color: '#17324a', fontSize: 12, fontWeight: '800', marginLeft: 8, marginBottom: 6 },
  inputWrap: {
    height: 45, borderWidth: 1, borderColor: '#17324a', borderRadius: 23, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', marginBottom: 10, backgroundColor: '#fff',
    shadowColor: '#0f172a', shadowOpacity: 0.18, shadowRadius: 2, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  input: { flex: 1, color: '#102e46', fontSize: 13, marginLeft: 8, paddingVertical: 0 },
  rememberRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginLeft: 8, marginBottom: 18 },
  rememberText: { color: '#17324a', fontSize: 11, marginLeft: 5 },
  errorText: { color: '#c62828', fontSize: 12, marginHorizontal: 8, marginBottom: 10 },
  primaryButton: { height: 47, borderRadius: 24, backgroundColor: '#15364a', alignItems: 'center', justifyContent: 'center', marginBottom: 12, elevation: 2 },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  footerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { color: '#31485a', fontSize: 11 },
  footerLink: { color: '#102e46', fontSize: 11, fontWeight: '900' },
});
