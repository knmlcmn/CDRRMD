import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText as Text, AppTextInput as TextInput } from '../components/Typography';
import { DashboardHeader } from '../components/DashboardHeader';
import { editorial } from '../components/EditorialTheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { AppProfile, getAccountById, updateAccountProfile } from '../services/appAccount';
import { putAuthMe } from '../services/api';
import { SUPPORTED_BARANGAYS } from '../constants/barangays';
import { useResponsiveLayout } from '../utils/responsive';

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
    barangayName: '',
  };

export default function MeScreen({ appUserId, onLogout }: Props) {
  const { isSmall, horizontalPadding } = useResponsiveLayout();
  const [profile, setProfile] = useState<AppProfile>(EMPTY_PROFILE);
  const [draftProfile, setDraftProfile] = useState<AppProfile>(EMPTY_PROFILE);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [changingBarangay, setChangingBarangay] = useState(false);
  const [barangayError, setBarangayError] = useState<string | null>(null);

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
        barangayName: draftProfile.barangayName,
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

  async function onChangeBarangay(barangayName: string) {
    if (!appUserId || saving) return;

    setSaving(true);
    setBarangayError(null);
    try {
      const nextProfile = { ...profile, barangayName };
      await putAuthMe({
        firstName: nextProfile.firstName,
        lastName: nextProfile.lastName,
        email: nextProfile.email,
        address: nextProfile.address,
        contactNumber: nextProfile.contactNumber,
        barangayName,
      });
      await updateAccountProfile(appUserId, nextProfile);
      setProfile(nextProfile);
      setDraftProfile(nextProfile);
      setChangingBarangay(false);
    } catch (err: any) {
      setBarangayError(err?.response?.data?.message || 'Unable to change your barangay area.');
    } finally {
      setSaving(false);
    }
  }

  const fullName = `${profile.firstName} ${profile.lastName}`.trim() || 'No name set';

  return (
    <View style={st.root}>
      <DashboardHeader action={!isEditing ? (
        <TouchableOpacity style={st.editHeaderBtn} onPress={onStartEdit}>
          <Text style={st.editHeaderText}>Edit</Text>
        </TouchableOpacity>
      ) : null} />

      <ScrollView contentContainerStyle={[st.scrollContent, { paddingHorizontal: horizontalPadding }]}>
        <Text style={st.pageTitle}>Me</Text>
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
            <View style={st.infoRow}>
              <Text style={st.infoLabel}>Barangay</Text>
              <Text style={st.infoValue}>{profile.barangayName || 'Not selected'}</Text>
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
            <View style={[st.areaHeaderRow, isSmall && st.areaHeaderSmall]}>
            <View style={st.areaIcon}>
              <MaterialCommunityIcons name="map-marker-radius" size={21} color="#0d3558" />
            </View>
            <View style={st.areaCopy}>
              <Text style={st.areaTitle}>Barangay Area</Text>
              <Text style={st.areaValue}>{profile.barangayName || 'Not assigned'}</Text>
            </View>
            <TouchableOpacity
              style={st.changeAreaBtn}
              onPress={() => { setBarangayError(null); setChangingBarangay((value) => !value); }}
              disabled={saving}
            >
              <Text style={st.changeAreaText}>{changingBarangay ? 'Cancel' : 'Change Area'}</Text>
            </TouchableOpacity>
          </View>
          {changingBarangay ? (
            <>
              <Text style={st.areaHelp}>Select your correct home barangay:</Text>
              <View style={st.barangayChoices}>
                {SUPPORTED_BARANGAYS.map((name) => (
                  <TouchableOpacity
                    key={name}
                    style={[st.barangayChoice, profile.barangayName === name && st.barangayChoiceActive]}
                    onPress={() => onChangeBarangay(name)}
                    disabled={saving}
                  >
                    <Text style={[st.barangayChoiceText, profile.barangayName === name && st.barangayChoiceTextActive]}>
                      {saving && profile.barangayName !== name ? name : name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : null}
          {barangayError ? <Text style={st.areaError}>{barangayError}</Text> : null}
        </View>

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
  root: { flex: 1, backgroundColor: editorial.background },
  scrollContent: { flexGrow: 1, width: '100%', maxWidth: 760, alignSelf: 'center', paddingTop: 16, paddingBottom: 110, backgroundColor: editorial.background },
  pageTitle: { color: editorial.ink, fontSize: 24, lineHeight: 28, marginBottom: 14 },
  editHeaderBtn: {
    borderWidth: 1,
    borderColor: editorial.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: '#ffffff',
  },
  editHeaderText: { color: '#111111', fontSize: 13, fontWeight: '700' },

  card: { backgroundColor: editorial.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: editorial.border },
  barangayLabel: { color: editorial.ink, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  barangayChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 10 },
  barangayChoice: { borderWidth: 1, borderColor: editorial.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  barangayChoiceActive: { backgroundColor: editorial.accent, borderColor: editorial.accent },
  barangayChoiceText: { color: '#475569', fontSize: 12, fontWeight: '700' },
  barangayChoiceTextActive: { color: '#fff' },
  areaHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  areaHeaderSmall: { flexWrap: 'wrap', gap: 8 },
  areaIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: editorial.accentSoft, alignItems: 'center', justifyContent: 'center' },
  areaCopy: { flex: 1, marginLeft: 10 },
  areaTitle: { color: editorial.muted, fontSize: 11, fontWeight: '700' },
  areaValue: { color: '#181818', fontSize: 15, fontWeight: '800', marginTop: 2 },
  changeAreaBtn: { borderWidth: 1, borderColor: editorial.accent, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7 },
  changeAreaText: { color: editorial.accent, fontSize: 11, fontWeight: '800' },
  areaHelp: { color: editorial.muted, fontSize: 11, marginTop: 14, marginBottom: 8 },
  areaError: { color: '#b91c1c', fontSize: 11, marginTop: 8 },

  profileRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: editorial.accentSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  profileName: { color: '#181818', fontSize: 16, fontWeight: '800' },
  profileHandle: { color: editorial.muted, fontSize: 13, marginTop: 1 },

  changeImgBtn: {
    borderWidth: 1, borderColor: editorial.border, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12,
    flexDirection: 'row', alignItems: 'center', marginTop: 12,
  },
  changeImgText: { color: '#475569', fontSize: 13, marginLeft: 6 },

  idRow: {
    borderWidth: 1,
    borderColor: editorial.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  idLabel: { color: '#475569', fontSize: 13, marginLeft: 8, flex: 1 },
  idValue: { color: '#181818', fontSize: 12, fontWeight: '800' },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: editorial.border,
    paddingVertical: 10,
  },
  infoLabel: { color: editorial.muted, fontSize: 13, fontWeight: '700' },
  infoValue: { color: '#181818', fontSize: 13, fontWeight: '700', maxWidth: '60%', flexShrink: 1, textAlign: 'right' },

  inputRow: {
    borderWidth: 1, borderColor: editorial.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', marginBottom: 10,
  },
  input: { flex: 1, marginLeft: 8, color: editorial.ink, fontSize: 14 },

  saveBtn: {
    backgroundColor: editorial.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4, flex: 1,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  editActionsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 },
  cancelBtn: {
    borderWidth: 1,
    borderColor: editorial.border,
    borderRadius: 10,
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
