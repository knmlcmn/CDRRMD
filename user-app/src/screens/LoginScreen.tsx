import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLogin() {
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Login is routed through resilient API host detection helper.
      const res = await postAuth('/auth/login', {
        email: email.trim(),
        password,
      });

      const session = res.data as SessionData;

      // Mobile app is intended for end-user accounts only.
      if (!session?.user || session.user.role !== 'user') {
        setError('This app is for user accounts only.');
        return;
      }

      await onLoginSuccess(session);
    } catch (err: any) {
      if (err?.code === 'ECONNABORTED' || err?.message?.toLowerCase?.().includes('network')) {
        setError('Cannot reach server. Make sure backend is running and phone is on same Wi-Fi.');
      } else {
        const responseMessage =
          err?.response?.data?.message ||
          (typeof err?.response?.data === 'string' ? err.response.data : null);
        setError(responseMessage ?? 'Invalid email or password.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <ImageBackground
        source={require('../../assets/Calamba_City_Hall_(Chipeco_Ave.,_Calamba,_Laguna)(2018-08-21).jpg')}
        resizeMode="cover"
        style={styles.bottomImage}
        imageStyle={styles.bottomImageStyle}
      />

      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.logoWrap}>
              <Image source={require('../../assets/cdrrmd-logo.png')} style={styles.logo} />
            </View>

            <Text style={styles.title}>Welcome back!</Text>

            <View style={styles.inputWrap}>
              <MaterialCommunityIcons name="account-outline" size={18} color="#c9d5e8" />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email Address"
                placeholderTextColor="#c9d5e8"
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={styles.inputWrap}>
              <MaterialCommunityIcons name="lock-outline" size={18} color="#c9d5e8" />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor="#c9d5e8"
                style={styles.input}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
                <MaterialCommunityIcons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color="#c9d5e8"
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.rememberRow} onPress={() => setRememberMe((v) => !v)}>
              <MaterialCommunityIcons
                name={rememberMe ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={18}
                color="#4b93ff"
              />
              <Text style={styles.rememberText}>Remember me</Text>
            </TouchableOpacity>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity style={styles.loginBtn} onPress={onLogin} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginBtnText}>Login</Text>}
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
  root: {
    flex: 1,
    backgroundColor: '#18356a',
  },
  keyboardWrap: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  bottomImage: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '33%',
    opacity: 0.18,
  },
  bottomImageStyle: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 32,
    paddingBottom: 26,
  },
  logoWrap: {
    alignSelf: 'center',
    width: 86,
    height: 86,
    borderRadius: 12,
    backgroundColor: '#40567f',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  logo: {
    width: 76,
    height: 76,
    borderRadius: 8,
  },
  title: {
    color: '#d4e1f7',
    fontSize: 44,
    fontWeight: '900',
    marginBottom: 20,
    textAlign: 'center',
  },
  inputWrap: {
    borderWidth: 1,
    borderColor: '#9fb0ca',
    borderRadius: 22,
    height: 50,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: 'rgba(23, 49, 92, 0.25)',
  },
  input: {
    flex: 1,
    color: '#e4ecf9',
    fontSize: 22,
    marginLeft: 8,
    paddingVertical: 0,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 0,
    marginBottom: 10,
  },
  rememberText: {
    color: '#d7e2f5',
    fontSize: 16,
    marginLeft: 8,
  },
  errorText: {
    color: '#fecaca',
    fontSize: 13,
    marginBottom: 8,
  },
  loginBtn: {
    height: 52,
    borderRadius: 26,
    backgroundColor: '#3d82ec',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  loginBtnText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  footerText: {
    color: '#d7e2f5',
    fontSize: 16,
    fontWeight: '600',
  },
  footerLink: {
    color: '#d7e2f5',
    fontSize: 16,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
});
