import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../services/api';
import { loadSession, SessionUser } from '../services/session';

function generateReportId() {
  const num = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return `#${num.slice(-5)}`;
}

const WATER_LEVELS = ['Ankle', 'Knee', 'Waist', 'Chest', 'Roof'];
const FLOOD_TYPES = ['Flash Flood', 'River Overflow', 'Drainage Backflow', 'Storm Surge', 'Other'];

export default function ReportFloodScreen() {
  const navigation = useNavigation();
  const [reportId] = useState(generateReportId);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [location, setLocation] = useState('');
  const [deviceCoords, setDeviceCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [floodType, setFloodType] = useState('');
  const [waterLevel, setWaterLevel] = useState('');
  const [arePeopleTrapped, setArePeopleTrapped] = useState<'Yes' | 'No' | ''>('');
  const [estimatedPeople, setEstimatedPeople] = useState('');
  const [notes, setNotes] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadSession().then((session) => {
      setSessionUser(session?.user ?? null);
    });
  }, []);

  async function useDeviceLocation() {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Location permission denied', 'Please allow location permission to use this feature.');
        return;
      }

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const text = `Lat ${pos.coords.latitude.toFixed(6)}, Lng ${pos.coords.longitude.toFixed(6)}`;
      setLocation(text);
      setDeviceCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    } catch {
      Alert.alert('Location unavailable', 'Unable to get your device location right now.');
    } finally {
      setLocating(false);
    }
  }

  async function pickProofImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission denied', 'Please allow media library access to upload proof.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      base64: true,
    });

    if (result.canceled || !result.assets?.[0]) {
      return;
    }

    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert('Image unavailable', 'Unable to read selected image.');
      return;
    }

    const mimeType = asset.mimeType || 'image/jpeg';
    setImageBase64(`data:${mimeType};base64,${asset.base64}`);
    setImageUri(asset.uri || null);
  }

  async function submitReport() {
    if (!location.trim() || !floodType || !waterLevel || !notes.trim() || !imageBase64) {
      Alert.alert('Incomplete report', 'Please provide location, flood type, water level, description, and uploaded proof image.');
      return;
    }

    setSubmitting(true);

    try {
      const parsed = String(location).match(/(-?\d+(?:\.\d+)?)\s*,?\s*(-?\d+(?:\.\d+)?)/);
      const fallbackLatitude = parsed ? Number(parsed[1]) : null;
      const fallbackLongitude = parsed ? Number(parsed[2]) : null;

      const response = await api.post('/reports', {
        reportType: 'flood',
        location,
        latitude: deviceCoords?.latitude ?? (Number.isFinite(fallbackLatitude) ? fallbackLatitude : null),
        longitude: deviceCoords?.longitude ?? (Number.isFinite(fallbackLongitude) ? fallbackLongitude : null),
        incidentType: floodType,
        waterLevel,
        arePeopleTrapped,
        estimatedPeople,
        notes,
        imageBase64,
        fullName: `${sessionUser?.firstName || ''} ${sessionUser?.lastName || ''}`.trim() || sessionUser?.username || '',
        contactNumber: sessionUser?.contactNumber || '',
      });

      const createdCode = response.data?.report_code || reportId;
      Alert.alert('Flood report submitted', `Report ID ${createdCode}`);
      setFloodType('');
      setWaterLevel('');
      setArePeopleTrapped('');
      setEstimatedPeople('');
      setLocation('');
      setNotes('');
      setImageBase64(null);
      setImageUri(null);
      setDeviceCoords(null);
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Unable to submit report right now.';
      Alert.alert('Submission failed', message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={st.root}>
      <View style={st.header}>
        <TouchableOpacity style={st.backBtn} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={st.headerCenter}>
          <MaterialCommunityIcons name="waves" size={24} color="#fff" />
          <Text style={st.headerTitle}>Flood Report</Text>
        </View>
        <View style={st.headerRightSpacer} />
      </View>

      <ScrollView contentContainerStyle={st.content}>
        <Text style={st.reportId}>Report ID: {reportId}</Text>

        <View style={st.card}>
          <Text style={st.sectionTitle}>Reporter Information</Text>
          <View style={st.infoRow}>
            <MaterialCommunityIcons name="account-outline" size={18} color="#64748b" />
            <Text style={st.infoText}>
              {`${sessionUser?.firstName || ''} ${sessionUser?.lastName || ''}`.trim() || sessionUser?.username || 'N/A'}
            </Text>
          </View>
          <View style={st.infoRow}>
            <MaterialCommunityIcons name="phone-outline" size={18} color="#64748b" />
            <Text style={st.infoText}>{sessionUser?.contactNumber || 'N/A'}</Text>
          </View>
          <View style={st.inputRow}>
            <MaterialCommunityIcons name="map-marker-outline" size={18} color="#64748b" />
            <TextInput
              style={st.input}
              value={location}
              onChangeText={setLocation}
              placeholder="Address / Location"
              placeholderTextColor="#94a3b8"
            />
          </View>
          <TouchableOpacity style={st.secondaryBtn} onPress={useDeviceLocation} disabled={locating}>
            {locating ? <ActivityIndicator color="#0f2948" /> : <Text style={st.secondaryBtnText}>Use Device Location</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={[st.secondaryBtn, { marginTop: 8 }]} onPress={pickProofImage}>
            <Text style={st.secondaryBtnText}>{imageUri ? 'Change Proof Image' : 'Upload Proof Image'}</Text>
          </TouchableOpacity>
          {imageUri ? <Image source={{ uri: imageUri }} style={st.previewImage} /> : null}
        </View>

        <View style={st.card}>
          <Text style={st.sectionTitle}>Incident Details</Text>

          <Text style={st.fieldLabel}>Flood Type</Text>
          <View style={st.chipWrap}>
            {FLOOD_TYPES.map((item) => {
              const active = floodType === item;
              return (
                <TouchableOpacity
                  key={item}
                  style={[st.chip, active && st.chipActive]}
                  onPress={() => setFloodType(item)}
                >
                  <Text style={[st.chipText, active && st.chipTextActive]}>{item}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[st.fieldLabel, { marginTop: 10 }]}>Water Level</Text>
          <View style={st.chipWrap}>
            {WATER_LEVELS.map((item) => {
              const active = waterLevel === item;
              return (
                <TouchableOpacity
                  key={item}
                  style={[st.chip, active && st.chipActive]}
                  onPress={() => setWaterLevel(item)}
                >
                  <Text style={[st.chipText, active && st.chipTextActive]}>{item}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[st.fieldLabel, { marginTop: 10 }]}>Are people trapped?</Text>
          <View style={st.inlineRow}>
            {(['Yes', 'No'] as const).map((item) => {
              const active = arePeopleTrapped === item;
              return (
                <TouchableOpacity
                  key={item}
                  style={[st.smallChip, active && st.chipActive]}
                  onPress={() => setArePeopleTrapped(item)}
                >
                  <Text style={[st.chipText, active && st.chipTextActive]}>{item}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[st.fieldLabel, { marginTop: 10 }]}>Estimated number of people</Text>
          <View style={st.inputRow}>
            <MaterialCommunityIcons name="account-group-outline" size={18} color="#64748b" />
            <TextInput
              style={st.input}
              value={estimatedPeople}
              onChangeText={setEstimatedPeople}
              placeholder="e.g. 5"
              keyboardType="number-pad"
              placeholderTextColor="#94a3b8"
            />
          </View>

          <Text style={[st.sectionTitle, { marginTop: 8 }]}>Additional Notes</Text>
          <TextInput
            style={st.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Enter additional details"
            placeholderTextColor="#94a3b8"
            multiline
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity style={st.submitBtn} onPress={submitReport} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={st.submitBtnText}>Submit Report</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#e8e8ec' },
  header: {
    backgroundColor: '#4d95bf',
    paddingTop: 48,
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { color: '#fff', fontSize: 24, fontWeight: '900' },
  headerRightSpacer: { width: 34, height: 34 },
  content: { padding: 14, paddingBottom: 30 },
  reportId: { color: '#334155', fontSize: 20, fontWeight: '800', marginBottom: 10 },
  card: { backgroundColor: '#f8fafc', borderRadius: 14, padding: 12, marginBottom: 10 },
  sectionTitle: { color: '#0f172a', fontSize: 22, fontWeight: '900', marginBottom: 8 },
  fieldLabel: { color: '#334155', fontSize: 14, fontWeight: '700', marginBottom: 6 },
  inputRow: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  input: { flex: 1, marginLeft: 8, color: '#0f2948', fontSize: 18 },
  infoRow: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  infoText: { marginLeft: 8, color: '#0f2948', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    backgroundColor: '#f1f5f9',
  },
  secondaryBtnText: { color: '#0f2948', fontSize: 14, fontWeight: '700' },
  previewImage: {
    width: '100%',
    height: 140,
    borderRadius: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#fff',
  },
  smallChip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 7,
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: '#e0f2fe', borderColor: '#7dd3fc' },
  chipText: { color: '#334155', fontSize: 14, fontWeight: '700' },
  chipTextActive: { color: '#0c4a6e' },
  notesInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    minHeight: 90,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#0f2948',
    fontSize: 16,
    backgroundColor: '#fff',
  },
  submitBtn: {
    backgroundColor: '#2f87b7',
    borderRadius: 26,
    paddingVertical: 13,
    alignItems: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: 20, fontWeight: '900' },
});
