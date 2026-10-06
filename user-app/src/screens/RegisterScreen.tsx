import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
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
import * as ImagePicker from 'expo-image-picker';
import { postAuth } from '../services/api';
import { SessionData } from '../services/session';
import { useResponsiveLayout } from '../utils/responsive';

type Props = {
  onRegisterSuccess: (session: SessionData) => Promise<void>;
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
  const [address, setAddress] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [validIdImage, setValidIdImage] = useState<string | null>(null);
  const [validIdUri, setValidIdUri] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickValidId() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Please allow photo access so you can upload a valid ID.');
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

    const mimeType = asset.mimeType || 'image/jpeg';
    setValidIdImage(`data:${mimeType};base64,${asset.base64}`);
    setValidIdUri(asset.uri || null);
    setError(null);
  }

  async function onRegister() {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password || !validIdImage) {
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
        validIdImage,
      });
      const nextSession = res.data as SessionData;
      if (!nextSession?.token || !nextSession.user || nextSession.user.role !== 'user') {
        setError('Registration failed for user account.');
        return;
      }
      await onRegisterSuccess(nextSession);
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
            <Field icon="email-outline" value={email} onChangeText={setEmail} placeholder="Email *" keyboardType="email-address" autoCapitalize="none" />
            <Field icon="map-marker-outline" value={address} onChangeText={setAddress} placeholder="Address" autoCapitalize="words" />
            <Field icon="phone-outline" value={contactNumber} onChangeText={setContactNumber} placeholder="Contact Number" keyboardType="phone-pad" />
            <Text style={styles.validIdLabel}>Upload Valid ID *</Text>
            <TouchableOpacity style={styles.uploadButton} onPress={pickValidId} disabled={loading}>
              <MaterialCommunityIcons name="card-account-details-outline" size={18} color={editorial.accent} />
              <Text style={styles.uploadButtonText}>{validIdImage ? 'Change Valid ID' : 'Choose Valid ID Image'}</Text>
            </TouchableOpacity>
            {validIdUri ? (
              <View style={styles.idPreviewWrap}>
                <Image source={{ uri: validIdUri }} style={styles.idPreview} resizeMode="contain" />
                <View style={styles.idReadyRow}>
                  <MaterialCommunityIcons name="check-circle" size={15} color="#15803d" />
                  <Text style={styles.idReadyText}>Valid ID ready for verification</Text>
                </View>
              </View>
            ) : (
              <Text style={styles.idHint}>Upload a clear photo of a government-issued or school ID.</Text>
            )}
            <Field
              icon="lock-outline" value={password} onChangeText={setPassword} placeholder="Password *" secureTextEntry={!showPassword}
              trailing={<TouchableOpacity onPress={() => setShowPassword((value) => !value)}><MaterialCommunityIcons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={16} color="#526170" /></TouchableOpacity>}
            />
            <Field
              icon="lock-check-outline" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm Password *" secureTextEntry={!showConfirmPassword}
              trailing={<TouchableOpacity onPress={() => setShowConfirmPassword((value) => !value)}><MaterialCommunityIcons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={16} color="#526170" /></TouchableOpacity>}
            />

            <Text style={styles.locationHint}>Your barangay will be assigned automatically from your latest live location after approval.</Text>
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
  validIdLabel: { color: editorial.ink, fontSize: 11, fontWeight: '800', marginHorizontal: 8, marginTop: 2, marginBottom: 6 },
  uploadButton: { height: 42, borderWidth: 1, borderStyle: 'dashed', borderColor: editorial.accent, borderRadius: 10, backgroundColor: '#f7fbfe', paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  uploadButtonText: { color: editorial.accent, fontSize: 12, fontWeight: '800', marginLeft: 7 },
  idPreviewWrap: { borderWidth: 1, borderColor: editorial.border, borderRadius: 10, padding: 8, marginBottom: 8, backgroundColor: '#fff' },
  idPreview: { width: '100%', height: 115, borderRadius: 7, backgroundColor: '#f1f5f9' },
  idReadyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  idReadyText: { color: '#15803d', fontSize: 10, fontWeight: '700', marginLeft: 5 },
  idHint: { color: '#64748b', fontSize: 10, marginHorizontal: 8, marginBottom: 8 },
  locationHint: { color: '#555555', fontSize: 10, marginHorizontal: 8, marginBottom: 8 },
  errorText: { color: '#c62828', fontSize: 11, marginHorizontal: 8, marginBottom: 8 },
  primaryButton: { height: 45, borderRadius: 10, backgroundColor: editorial.accent, alignItems: 'center', justifyContent: 'center', marginTop: 2, marginBottom: 10 },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  footerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { color: '#555555', fontSize: 10 },
  footerLink: { color: editorial.accent, fontSize: 10, fontWeight: '900' },
});
