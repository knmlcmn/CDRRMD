import { useState, type ReactNode } from 'react';
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
import { AppProfile } from '../services/appAccount';

type Props = {
  onRegisterSuccess: (session: SessionData, profile?: AppProfile) => Promise<void>;
  onShowLogin: () => void;
};

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
      <MaterialCommunityIcons name={icon} size={16} color="#17324a" />
      <TextInput {...props} placeholderTextColor="#526170" style={styles.input} />
      {trailing}
    </View>
  );
}

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
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
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
      const nextSession = res.data as SessionData;
      if (!nextSession?.user || nextSession.user.role !== 'user') {
        setError('Registration failed for user account.');
        return;
      }
      await onRegisterSuccess(nextSession, {
        firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(),
        address: address.trim(), contactNumber: contactNumber.trim(), barangayName: '',
      });
    } catch (err: any) {
      if (err?.code === 'ECONNABORTED' || err?.message?.toLowerCase?.().includes('network')) {
        setError('Cannot reach the server. Check your connection and try again.');
      } else {
        setError(err?.response?.data?.message || 'Unable to register right now.');
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
            <Text style={styles.title}>Create your Account</Text>
            <Text style={styles.sectionLabel}>Register</Text>

            <Field icon="account-outline" value={username} onChangeText={setUsername} placeholder="Username" autoCapitalize="none" />
            <View style={styles.nameRow}>
              <View style={styles.nameField}><Field icon="account-outline" value={firstName} onChangeText={setFirstName} placeholder="First Name *" autoCapitalize="words" /></View>
              <View style={styles.nameField}><Field icon="account-outline" value={lastName} onChangeText={setLastName} placeholder="Last Name *" autoCapitalize="words" /></View>
            </View>
            <Field icon="email-outline" value={email} onChangeText={setEmail} placeholder="Email *" keyboardType="email-address" autoCapitalize="none" />
            <Field icon="map-marker-outline" value={address} onChangeText={setAddress} placeholder="Address" autoCapitalize="words" />
            <Field icon="phone-outline" value={contactNumber} onChangeText={setContactNumber} placeholder="Contact Number" keyboardType="phone-pad" />
            <Field
              icon="lock-outline" value={password} onChangeText={setPassword} placeholder="Password *" secureTextEntry={!showPassword}
              trailing={<TouchableOpacity onPress={() => setShowPassword((value) => !value)}><MaterialCommunityIcons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={16} color="#526170" /></TouchableOpacity>}
            />
            <Field
              icon="lock-check-outline" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm Password *" secureTextEntry={!showConfirmPassword}
              trailing={<TouchableOpacity onPress={() => setShowConfirmPassword((value) => !value)}><MaterialCommunityIcons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={16} color="#526170" /></TouchableOpacity>}
            />

            <Text style={styles.locationHint}>Your barangay will be assigned from your location after registration.</Text>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity style={styles.primaryButton} onPress={onRegister} disabled={loading} activeOpacity={0.85}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Create Account</Text>}
            </TouchableOpacity>
            <View style={styles.footerRow}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <TouchableOpacity onPress={onShowLogin}><Text style={styles.footerLink}>Login</Text></TouchableOpacity>
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
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 24 },
  form: { width: '100%', maxWidth: 420 },
  logo: { width: 88, height: 88, alignSelf: 'center', marginBottom: 16 },
  title: { color: '#102e46', fontSize: 20, fontWeight: '900', textAlign: 'center', marginBottom: 18 },
  sectionLabel: { color: '#17324a', fontSize: 12, fontWeight: '800', marginLeft: 8, marginBottom: 6 },
  inputWrap: {
    height: 42, borderWidth: 1, borderColor: '#17324a', borderRadius: 22, paddingHorizontal: 13,
    flexDirection: 'row', alignItems: 'center', marginBottom: 8, backgroundColor: '#fff',
    shadowColor: '#0f172a', shadowOpacity: 0.16, shadowRadius: 2, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  input: { flex: 1, color: '#102e46', fontSize: 12, marginLeft: 7, paddingVertical: 0, minWidth: 0 },
  nameRow: { flexDirection: 'row', gap: 7 },
  nameField: { flex: 1, minWidth: 0 },
  locationHint: { color: '#526170', fontSize: 10, marginHorizontal: 8, marginBottom: 8 },
  errorText: { color: '#c62828', fontSize: 11, marginHorizontal: 8, marginBottom: 8 },
  primaryButton: { height: 45, borderRadius: 23, backgroundColor: '#15364a', alignItems: 'center', justifyContent: 'center', marginTop: 2, marginBottom: 10, elevation: 2 },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  footerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { color: '#31485a', fontSize: 10 },
  footerLink: { color: '#102e46', fontSize: 10, fontWeight: '900' },
});
