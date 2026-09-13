import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { AppProfile, getAccountById, updateAccountProfile } from '../services/appAccount';
import { putAuthMe } from '../services/api';

type Props = {
  appUserId: string;
  onLogout?: () => void | Promise<void>;
};

const EMPTY_PROFILE: AppProfile = {
    firstName: '',
    lastName: '',
    email: '',
    address: '',
    contactNumber: '',
  };

export default function MeScreen({ appUserId, onLogout }: Props) {
  const [profile, setProfile] = useState<AppProfile>(EMPTY_PROFILE);
  const [draftProfile, setDraftProfile] = useState<AppProfile>(EMPTY_PROFILE);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      async function loadProfile() {
        if (!appUserId) {
          setProfile(EMPTY_PROFILE);
          return;
        }

        const account = await getAccountById(appUserId);
        if (!account) {
          setProfile(EMPTY_PROFILE);
          return;
        }

        setProfile(account.profile);
        setDraftProfile(account.profile);
      }

      loadProfile().catch(() => {});
    }, [appUserId]),
  );

  function onChange<K extends keyof AppProfile>(field: K, value: AppProfile[K]) {
    setDraftProfile((prev) => ({ ...prev, [field]: value }));
  }

  async function onSaveProfile() {
    if (!appUserId) {
      return;
    }

    setSaving(true);
    try {
      await putAuthMe({
        firstName: draftProfile.firstName,
        lastName: draftProfile.lastName,
        email: draftProfile.email,
        address: draftProfile.address,
        contactNumber: draftProfile.contactNumber,
      });
      await updateAccountProfile(appUserId, draftProfile);
      setProfile(draftProfile);
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function onStartEdit() {
    setDraftProfile(profile);
    setIsEditing(true);
  }

  function onCancelEdit() {
    setDraftProfile(profile);
    setIsEditing(false);
  }

  const fullName = `${profile.firstName} ${profile.lastName}`.trim() || 'No name set';

  return (
    <View style={st.root}>
      {/* Header */}
      <View style={st.header}>
        <Text style={st.headerTitle}>Me</Text>
        {!isEditing ? (
          <TouchableOpacity style={st.editHeaderBtn} onPress={onStartEdit}>
            <Text style={st.editHeaderText}>Edit</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
        {/* Profile Card */}
        <View style={st.card}>
          <View style={st.profileRow}>
            <View style={st.avatar}>
              <MaterialCommunityIcons name="account" size={30} color="#94a3b8" />
            </View>
            <View style={{ marginLeft: 12 }}>
              <Text style={st.profileName}>{fullName}</Text>
              <Text style={st.profileHandle}>{profile.firstName || '-'}</Text>
            </View>
          </View>
          <TouchableOpacity style={st.changeImgBtn}>
            <MaterialCommunityIcons name="image-edit-outline" size={15} color="#64748b" />
            <Text style={st.changeImgText}>Add / Change Profile Image</Text>
          </TouchableOpacity>
        </View>

        {!isEditing ? (
          <View style={st.card}>
            <View style={st.idRow}>
              <MaterialCommunityIcons name="identifier" size={18} color="#64748b" />
              <Text style={st.idLabel}>Account ID</Text>
              <Text style={st.idValue}>{appUserId || '-'}</Text>
            </View>

            <View style={st.infoRow}>
              <Text style={st.infoLabel}>First Name</Text>
              <Text style={st.infoValue}>{profile.firstName || '-'}</Text>
            </View>
            <View style={st.infoRow}>
              <Text style={st.infoLabel}>Last Name</Text>
              <Text style={st.infoValue}>{profile.lastName || '-'}</Text>
            </View>
            <View style={st.infoRow}>
              <Text style={st.infoLabel}>Email</Text>
              <Text style={st.infoValue}>{profile.email || '-'}</Text>
            </View>
            <View style={st.infoRow}>
              <Text style={st.infoLabel}>Address</Text>
              <Text style={st.infoValue}>{profile.address || '-'}</Text>
            </View>
            <View style={[st.infoRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
              <Text style={st.infoLabel}>Contact Number</Text>
              <Text style={st.infoValue}>{profile.contactNumber || '-'}</Text>
            </View>
          </View>
        ) : (
          <View style={st.card}>
            <View style={st.idRow}>
              <MaterialCommunityIcons name="identifier" size={18} color="#64748b" />
              <Text style={st.idLabel}>Account ID</Text>
              <Text style={st.idValue}>{appUserId || '-'}</Text>
            </View>

            {/* First Name */}
            <View style={st.inputRow}>
              <MaterialCommunityIcons name="account-outline" size={18} color="#64748b" />
              <TextInput style={st.input} value={draftProfile.firstName} onChangeText={(t) => onChange('firstName', t)} placeholder="First Name" placeholderTextColor="#94a3b8" />
            </View>
            {/* Last Name */}
            <View style={st.inputRow}>
              <MaterialCommunityIcons name="account-outline" size={18} color="#64748b" />
              <TextInput style={st.input} value={draftProfile.lastName} onChangeText={(t) => onChange('lastName', t)} placeholder="Last Name" placeholderTextColor="#94a3b8" />
            </View>
            {/* Email */}
            <View style={st.inputRow}>
              <MaterialCommunityIcons name="email-outline" size={18} color="#64748b" />
              <TextInput style={st.input} value={draftProfile.email} onChangeText={(t) => onChange('email', t)} placeholder="Email" keyboardType="email-address" placeholderTextColor="#94a3b8" />
            </View>
            {/* Address */}
            <View style={st.inputRow}>
              <MaterialCommunityIcons name="map-marker-outline" size={18} color="#64748b" />
              <TextInput style={st.input} value={draftProfile.address} onChangeText={(t) => onChange('address', t)} placeholder="Address" placeholderTextColor="#94a3b8" />
            </View>
            {/* Contact */}
            <View style={st.inputRow}>
              <MaterialCommunityIcons name="phone-outline" size={18} color="#64748b" />
              <TextInput style={st.input} value={draftProfile.contactNumber} onChangeText={(t) => onChange('contactNumber', t)} placeholder="Contact Number" keyboardType="phone-pad" placeholderTextColor="#94a3b8" />
            </View>

            <View style={st.editActionsRow}>
              <TouchableOpacity style={st.cancelBtn} onPress={onCancelEdit} disabled={saving}>
                <Text style={st.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.saveBtn} onPress={onSaveProfile} disabled={saving}>
                <Text style={st.saveBtnText}>{saving ? 'Saving...' : 'Save Profile'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={st.card}>
          <TouchableOpacity style={st.logoutBtn} onPress={onLogout}>
            <MaterialCommunityIcons name="logout" size={17} color="#fff" />
            <Text style={st.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#d4d4d8' },

  header: {
    backgroundColor: '#0d3558', paddingTop: 48, paddingBottom: 14, paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '900', flex: 1 },
  editHeaderBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  editHeaderText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  card: { backgroundColor: '#f8fafc', borderRadius: 14, padding: 14, marginBottom: 10 },

  profileRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: '#e2e8f0',
    alignItems: 'center', justifyContent: 'center',
  },
  profileName: { color: '#0f2948', fontSize: 16, fontWeight: '800' },
  profileHandle: { color: '#64748b', fontSize: 13, marginTop: 1 },

  changeImgBtn: {
    borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12,
    flexDirection: 'row', alignItems: 'center', marginTop: 12,
  },
  changeImgText: { color: '#475569', fontSize: 13, marginLeft: 6 },

  idRow: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  idLabel: { color: '#475569', fontSize: 13, marginLeft: 8, flex: 1 },
  idValue: { color: '#0f2948', fontSize: 12, fontWeight: '800' },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 10,
  },
  infoLabel: { color: '#64748b', fontSize: 13, fontWeight: '700' },
  infoValue: { color: '#0f2948', fontSize: 13, fontWeight: '700', maxWidth: '60%' },

  inputRow: {
    borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 24, paddingHorizontal: 14, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', marginBottom: 10,
  },
  input: { flex: 1, marginLeft: 8, color: '#0f2948', fontSize: 14 },

  saveBtn: {
    backgroundColor: '#1f678f', borderRadius: 24, paddingVertical: 12, alignItems: 'center', marginTop: 4, flex: 1,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  editActionsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 },
  cancelBtn: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: 'center',
    flex: 1,
    backgroundColor: '#fff',
  },
  cancelBtnText: { color: '#475569', fontSize: 15, fontWeight: '800' },

  logoutBtn: {
    backgroundColor: '#e72424', borderRadius: 24, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  logoutText: { color: '#fff', fontSize: 15, fontWeight: '800', marginLeft: 6 },
});
