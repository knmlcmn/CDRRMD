import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText as Text, AppTextInput as TextInput } from '../components/Typography';
import { DashboardHeader } from '../components/DashboardHeader';
import { editorial } from '../components/EditorialTheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { AppAccount, getFamilyAccounts, inviteFamilyById } from '../services/appAccount';
import { useResponsiveLayout } from '../utils/responsive';

type FamilyStatus = 'Safe' | 'No Response';

type FamilyMember = {
  id: string;
  firstName: string;
  lastName: string;
  status: FamilyStatus;
  updatedAt: string;
};

type Props = {
  appUserId: string;
};

function fmtTime(date = new Date()) {
  const m = date.toLocaleString([], { month: 'short' });
  const d = date.toLocaleString([], { day: '2-digit' });
  const t = date.toLocaleString([], { hour: '2-digit', minute: '2-digit' });
  return `${m} ${d}, ${t}`;
}

export default function FamilyScreen({ appUserId }: Props) {
  const { isSmall, horizontalPadding } = useResponsiveLayout();
  const [myStatus, setMyStatus] = useState<FamilyStatus>('Safe');
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [inviteId, setInviteId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mapMembers = useCallback((accounts: AppAccount[]): FamilyMember[] => {
    return accounts.map((account) => ({
      id: account.appUserId,
      firstName: account.profile.firstName,
      lastName: account.profile.lastName,
      status: 'No Response',
      updatedAt: fmtTime(),
    }));
  }, []);

  const reloadMembers = useCallback(async () => {
    if (!appUserId) {
      setMembers([]);
      return;
    }

    const family = await getFamilyAccounts(appUserId);
    setMembers(mapMembers(family));
  }, [appUserId, mapMembers]);

  useFocusEffect(
    useCallback(() => {
      reloadMembers().catch(() => {});
    }, [reloadMembers]),
  );

  const counts = useMemo(() => {
    const safe = members.filter((m) => m.status === 'Safe').length + (myStatus === 'Safe' ? 1 : 0);
    const nr = members.filter((m) => m.status === 'No Response').length + (myStatus === 'No Response' ? 1 : 0);
    return { safe, nr };
  }, [members, myStatus]);

  async function addMember() {
    if (!inviteId.trim()) {
      setError('Enter a Family ID to invite.');
      return;
    }

    const result = await inviteFamilyById(appUserId, inviteId.trim());

    if (!result.ok) {
      const messages = {
        'not-found': 'Family account ID not found in this app.',
        self: 'You cannot invite your own ID.',
        exists: 'Family member already invited.',
      } as const;
      setError(messages[result.reason]);
      return;
    }

    setError(null);
    setInviteId('');
    await reloadMembers();
  }

  function fullName(firstName: string, lastName: string) {
    const name = `${firstName} ${lastName}`.trim();
    return name || 'No name set';
  }

  return (
    <View style={st.root}>
      <DashboardHeader action={
        <TouchableOpacity onPress={addMember} style={st.addBtn} accessibilityLabel="Invite family member">
          <MaterialCommunityIcons name="account-plus-outline" size={18} color="#111111" />
        </TouchableOpacity>
      } />

      <ScrollView contentContainerStyle={[st.scrollContent, { paddingHorizontal: horizontalPadding }]}>
        <Text style={st.pageTitle}>Family Status</Text>
        {/* Counters */}
        <View style={st.counterRow}>
          <View style={st.counterCard}>
            <Text style={[st.counterLabel, { color: '#166534' }]}>Safe</Text>
            <Text style={[st.counterValue, { color: '#14532d' }]}>{counts.safe}</Text>
          </View>
          <View style={st.counterCard}>
            <Text style={[st.counterLabel, { color: '#b45309' }]}>No Response</Text>
            <Text style={[st.counterValue, { color: '#78350f' }]}>{counts.nr}</Text>
          </View>
        </View>

        {/* Your Status */}
        <View style={st.card}>
          <View style={st.yourStatusRow}>
            <Text style={st.yourStatusLabel}>Your Status (This Device)</Text>
            <View style={[st.badge, { backgroundColor: myStatus === 'Safe' ? '#dcfce7' : '#fef3c7' }]}>
              <MaterialCommunityIcons
                name={myStatus === 'Safe' ? 'shield-check' : 'clock-alert-outline'}
                size={13}
                color={myStatus === 'Safe' ? '#15803d' : '#b45309'}
              />
              <Text style={[st.badgeText, { color: myStatus === 'Safe' ? '#166534' : '#b45309' }]}>
                {myStatus}
              </Text>
            </View>
          </View>
          <Text style={st.yourStatusNote}>Only you can mark yourself as safe.</Text>
          <TouchableOpacity
            style={[st.markBtn, { backgroundColor: myStatus === 'Safe' ? '#16a34a' : '#cbd5e1' }]}
            onPress={() => setMyStatus(myStatus === 'Safe' ? 'No Response' : 'Safe')}
          >
            <Text style={[st.markBtnText, { color: myStatus === 'Safe' ? '#fff' : '#334155' }]}>
              {myStatus === 'Safe' ? 'You are Marked Safe' : 'Mark Safe'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={st.card}>
          <Text style={st.yourStatusLabel}>Invite family by account ID</Text>
          <View style={st.inviteRow}>
            <MaterialCommunityIcons name="card-account-details-outline" size={18} color="#64748b" />
            <TextInput
              style={st.inviteInput}
              value={inviteId}
              onChangeText={setInviteId}
              placeholder="Enter Family ID"
              placeholderTextColor="#94a3b8"
              autoCapitalize="characters"
            />
          </View>
          {error ? <Text style={st.errorText}>{error}</Text> : null}
          <TouchableOpacity style={st.inviteBtn} onPress={addMember}>
            <Text style={st.inviteBtnText}>Invite Member</Text>
          </TouchableOpacity>
        </View>

        {/* Members */}
        {members.map((m) => (
          <View key={m.id} style={st.card}>
            <View style={[st.memberRow, isSmall && st.wrapOnSmall]}>
              <View style={st.memberIcon}>
                <MaterialCommunityIcons name="account-outline" size={20} color="#64748b" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.memberName}>{fullName(m.firstName, m.lastName)}</Text>
                <Text style={st.memberRelation}>Account ID: {m.id}</Text>
              </View>
              <View style={[st.badge, { backgroundColor: m.status === 'Safe' ? '#dcfce7' : '#fef3c7' }]}>
                <MaterialCommunityIcons
                  name={m.status === 'Safe' ? 'shield-check' : 'clock-alert-outline'}
                  size={13}
                  color={m.status === 'Safe' ? '#15803d' : '#b45309'}
                />
                <Text style={[st.badgeText, { color: m.status === 'Safe' ? '#166534' : '#b45309' }]}>
                  {m.status}
                </Text>
              </View>
            </View>
            <View style={[st.memberFooter, isSmall && st.wrapOnSmall]}>
              <Text style={st.memberMeta}>Updated: {m.updatedAt}</Text>
              <Text style={st.memberMeta}>Family status is view only</Text>
            </View>
          </View>
        ))}

        {members.length === 0 ? (
          <View style={st.card}>
            <Text style={st.memberMeta}>No family members invited yet.</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: editorial.background },
  scrollContent: { flexGrow: 1, width: '100%', maxWidth: 760, alignSelf: 'center', paddingTop: 16, paddingBottom: 110, backgroundColor: editorial.background },
  pageTitle: { color: editorial.ink, fontSize: 26, lineHeight: 31, fontWeight: '800', marginBottom: 14 },
  addBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#ffffff',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: editorial.border,
  },

  counterRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  counterCard: { width: '48%', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, backgroundColor: editorial.surface, borderWidth: 1, borderColor: editorial.border },
  counterLabel: { fontSize: 14, fontWeight: '600' },
  counterValue: { fontSize: 32, fontWeight: '900', lineHeight: 36 },

  card: { backgroundColor: editorial.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: editorial.border },

  yourStatusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  yourStatusLabel: { color: '#585858', fontSize: 13 },
  yourStatusNote: { color: '#181818', fontSize: 13, fontWeight: '600', marginTop: 6 },

  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: '700', marginLeft: 4 },

  markBtn: { borderRadius: 12, paddingVertical: 10, alignItems: 'center', marginTop: 10 },
  markBtnText: { fontSize: 14, fontWeight: '700' },

  inviteRow: {
    borderWidth: 1,
    borderColor: editorial.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inviteInput: { flex: 1, marginLeft: 8, color: editorial.ink, fontSize: 14 },
  inviteBtn: {
    backgroundColor: editorial.accent,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  inviteBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  errorText: { color: '#dc2626', fontSize: 12, marginTop: 8 },

  memberRow: { flexDirection: 'row', alignItems: 'flex-start' },
  memberIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: editorial.accentSoft, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  memberName: { color: '#181818', fontSize: 14, fontWeight: '700' },
  memberRelation: { color: '#585858', fontSize: 12, marginTop: 1 },
  memberFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  wrapOnSmall: { flexWrap: 'wrap', gap: 8 },
  memberMeta: { color: '#656565', fontSize: 11 },
});
