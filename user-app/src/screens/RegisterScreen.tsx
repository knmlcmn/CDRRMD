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
import { AppProfile } from '../services/appAccount';

type Props = {
  onRegisterSuccess: (session: SessionData, profile?: AppProfile) => Promise<void>;
  onShowLogin: () => void;
};

export default function RegisterScreen({ onRegisterSuccess, onShowLogin }: Props) {
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onRegister() {
    if (!firstName.trim() || !lastName.trim() || !password || !email.trim()) {
      setError('Please fill in all required fields.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please check and try again.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await postAuth('/auth/register', {
        username: username.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        address: address.trim(),
        contactNumber: contactNumber.trim(),
      });

      const session = res.data as SessionData;

      if (!session?.user || session.user.role !== 'user') {
        setError('Registration failed for user account.');
        return;
      }

      await onRegisterSuccess(session, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        address: address.trim(),
        contactNumber: contactNumber.trim(),
      });
    } catch (err: any) {
      if (err?.code === 'ECONNABORTED' || err?.message?.toLowerCase?.().includes('network')) {
        setError('Cannot reach server. Make sure backend is running and phone is on same Wi-Fi.');
      } else {
        const responseMessage =
          err?.response?.data?.message ||
          (typeof err?.response?.data === 'string' ? err.response.data : null);
        setError(responseMessage ?? 'Unable to register right now.');
      }
    } finally {
      setLoading(false);
    }
  }

  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;

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

            <Text style={styles.title}>Create Your Account!</Text>

            {/* Username */}
            <View style={styles.inputWrap}>
              <MaterialCommunityIcons name="account-outline" size={18} color="#c9d5e8" />
              <TextInput value={username} onChangeText={setUsername} placeholder="Username (optional)" placeholderTextColor="#c9d5e8" style={styles.input} autoCapitalize="none" />
            </View>

            {/* First Name */}
            <View style={styles.inputWrap}>
              <MaterialCommunityIcons name="account-outline" size={18} color="#c9d5e8" />
              <TextInput value={firstName} onChangeText={setFirstName} placeholder="First Name *" placeholderTextColor="#c9d5e8" style={styles.input} />
            </View>

            {/* Last Name */}
            <View style={styles.inputWrap}>
              <MaterialCommunityIcons name="account-outline" size={18} color="#c9d5e8" />
              <TextInput value={lastName} onChangeText={setLastName} placeholder="Last Name *" placeholderTextColor="#c9d5e8" style={styles.input} />
            </View>

            {/* Email Address */}
            <View style={styles.inputWrap}>
              <MaterialCommunityIcons name="email-outline" size={18} color="#c9d5e8" />
              <TextInput value={email} onChangeText={setEmail} placeholder="Email Address *" placeholderTextColor="#c9d5e8" style={styles.input} autoCapitalize="none" keyboardType="email-address" />
            </View>

            {/* Address */}
            <View style={styles.inputWrap}>
              <MaterialCommunityIcons name="map-marker-outline" size={18} color="#c9d5e8" />
              <TextInput value={address} onChangeText={setAddress} placeholder="Address" placeholderTextColor="#c9d5e8" style={styles.input} />
            </View>

            {/* Contact Number */}
            <View style={styles.inputWrap}>
              <MaterialCommunityIcons name="phone-outline" size={18} color="#c9d5e8" />
              <TextInput value={contactNumber} onChangeText={setContactNumber} placeholder="Contact Number" placeholderTextColor="#c9d5e8" style={styles.input} keyboardType="phone-pad" />
            </View>

            {/* Password */}
            <View style={styles.inputWrap}>
              <MaterialCommunityIcons name="lock-outline" size={18} color="#c9d5e8" />
              <TextInput value={password} onChangeText={setPassword} placeholder="Password *" placeholderTextColor="#c9d5e8" style={styles.input} secureTextEntry={!showPassword} />
              <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
                <MaterialCommunityIcons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#c9d5e8" />
              </TouchableOpacity>
            </View>

            {/* Confirm Password */}
            <View style={[styles.inputWrap, passwordMismatch && styles.inputWrapError]}>
              <MaterialCommunityIcons name="lock-check-outline" size={18} color={passwordMismatch ? '#fca5a5' : '#c9d5e8'} />
              <TextInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm Password *" placeholderTextColor="#c9d5e8" style={styles.input} secureTextEntry={!showConfirmPassword} />
              <TouchableOpacity onPress={() => setShowConfirmPassword((v) => !v)}>
                <MaterialCommunityIcons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={passwordMismatch ? '#fca5a5' : '#c9d5e8'} />
              </TouchableOpacity>
            </View>
            {passwordMismatch ? (
              <Text style={styles.mismatchText}>⚠ Passwords do not match</Text>
            ) : null}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.createBtn, passwordMismatch && styles.createBtnDisabled]}
              onPress={onRegister}
              disabled={loading || passwordMismatch}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Create Account</Text>}
            </TouchableOpacity>

            <View style={styles.footerRow}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <TouchableOpacity onPress={onShowLogin}>
                <Text style={styles.footerLink}>Login</Text>
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
    height: '29%',
    opacity: 0.18,
  },
  bottomImageStyle: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 18,
  },
  logoWrap: {
    alignSelf: 'center',
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: '#40567f',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logo: {
    width: 68,
    height: 68,
    borderRadius: 8,
  },
  title: {
    color: '#d4e1f7',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 12,
    textAlign: 'center',
  },
  inputWrap: {
    borderWidth: 1,
    borderColor: '#9fb0ca',
    borderRadius: 18,
    height: 44,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 7,
    backgroundColor: 'rgba(23, 49, 92, 0.25)',
  },
  inputWrapError: {
    borderColor: '#fca5a5',
    backgroundColor: 'rgba(127, 29, 29, 0.18)',
  },
  input: {
    flex: 1,
    color: '#e4ecf9',
    fontSize: 14,
    marginLeft: 7,
    paddingVertical: 0,
  },
  mismatchText: {
    color: '#fca5a5',
    fontSize: 12,
    marginBottom: 6,
    marginLeft: 4,
  },
  errorText: {
    color: '#fecaca',
    fontSize: 13,
    marginBottom: 8,
  },
  createBtn: {
    height: 46,
    borderRadius: 23,
    backgroundColor: '#3d82ec',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  createBtnDisabled: {
    backgroundColor: '#4b5f82',
    opacity: 0.7,
  },
  createBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  footerText: {
    color: '#d7e2f5',
    fontSize: 12,
    fontWeight: '600',
  },
  footerLink: {
    color: '#d7e2f5',
    fontSize: 12,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
});

