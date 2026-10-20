import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText as Text, AppTextInput as TextInput } from '../../components/Typography';
import { Card, DetailRow, EmptyState, ErrorMessage, PrimaryButton, RescuerScreen, rescuerColors } from '../components/RescuerScreen';
import { loadRescuerAccounts, updateMyProfile } from '../services/rescuerService';
import type { RescuerAccount, ResponderRole } from '../types';

type EditValues = { firstName: string; lastName: string; email: string; address: string; contactNumber: string };

function valuesFromAccount(account: RescuerAccount): EditValues {
  return { firstName: account.first_name || '', lastName: account.last_name || '', email: account.email || '', address: account.address || '', contactNumber: account.contact_number || '' };
}

function formatLastLogin(value?: string | null) {
  return value ? new Date(value).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never';
}

export default function AccountScreen({ role, onAuthError }: { role: ResponderRole; onAuthError: () => void }) {
  const [accounts, setAccounts] = useState<RescuerAccount[]>([]);
  const [selected, setSelected] = useState<RescuerAccount | null>(null);
  const [values, setValues] = useState<EditValues>({ firstName: '', lastName: '', email: '', address: '', contactNumber: '' });
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setAccounts(await loadRescuerAccounts()); setError(''); }
    catch (caught: any) {
      if (caught?.response?.status === 401) onAuthError();
      else setError(caught?.response?.data?.message || 'Unable to load rescuer accounts.');
    } finally { setLoading(false); }
  }, [onAuthError]);

  useEffect(() => { void refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return accounts;
    return accounts.filter((account) => [account.rescuer_id, account.first_name, account.last_name, account.email, account.username, account.contact_number]
      .some((value) => String(value || '').toLowerCase().includes(needle)));
  }, [accounts, search]);

  function openAccount(account: RescuerAccount) {
    setSelected(account);
    setValues(valuesFromAccount(account));
    setEditing(false);
    setError('');
  }

  async function save() {
    if (!selected?.is_self || saving) return;
    if (!values.email.trim().includes('@')) { setError('Enter a valid email address.'); return; }
    setSaving(true); setError(''); setMessage('');
    try {
      await updateMyProfile({ ...values, email: values.email.trim().toLowerCase() });
      await refresh();
      setSelected(null);
      setMessage('Your account information was updated.');
    } catch (caught: any) {
      if (caught?.response?.status === 401) onAuthError();
      else setError(caught?.response?.data?.message || 'Unable to update your account.');
    } finally { setSaving(false); }
  }

  return (
    <RescuerScreen title="Account" subtitle="View fellow rescuers and manage only your own account" refreshing={loading} onRefresh={() => void refresh()}>
      <ErrorMessage message={error} />
      {message ? <Text style={styles.success}>{message}</Text> : null}
      <Card>
        <View style={styles.managementHeader}><Text style={styles.title}>Rescuer Account Management</Text><TextInput value={search} onChangeText={setSearch} placeholder="Search by name, email, username, or contact" placeholderTextColor="#64748b" style={styles.input} /></View>
        {!filtered.length ? <EmptyState loading={loading} message="No rescuer account found." /> : <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableWrap}><View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHead]}>{['ID', 'Name', 'Email', 'Username', 'Contact', 'Status', 'Last Login', 'Actions'].map((label, index) => <Text key={label} style={[styles.cell, index === 2 && styles.emailCell, styles.headText]}>{label}</Text>)}</View>
          {filtered.map((account, index) => <View key={account.id} style={[styles.tableRow, index % 2 === 1 && styles.altRow, account.is_self && styles.selfRow]}>
            <Text style={styles.cell}>{account.rescuer_id}{account.is_self ? '  You' : ''}</Text><Text style={styles.cell}>{[account.first_name, account.last_name].filter(Boolean).join(' ') || 'N/A'}</Text><Text style={[styles.cell, styles.emailCell]}>{account.email || 'N/A'}</Text><Text style={styles.cell}>{account.username || 'N/A'}</Text><Text style={styles.cell}>{account.contact_number || 'N/A'}</Text><View style={styles.cell}><Text style={[styles.presence, account.is_online && styles.online]}>{account.is_online ? 'Online' : 'Offline'}</Text></View><Text style={styles.cell}>{formatLastLogin(account.last_login)}</Text><View style={styles.cell}><TouchableOpacity onPress={() => openAccount(account)} style={styles.viewButton}><Text style={styles.viewText}>View</Text></TouchableOpacity></View>
          </View>)}
        </View></ScrollView>}
      </Card>

      <Modal visible={Boolean(selected)} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.backdrop}><View style={styles.modal}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
          <View style={styles.titleRow}><Text style={styles.modalTitle}>{role === 'barangay_rescuer' ? 'Barangay Rescuer Account' : 'CDRRMD Rescuer Account'}</Text><TouchableOpacity onPress={() => setSelected(null)}><Text style={styles.close}>Close</Text></TouchableOpacity></View>
          {selected ? editing && selected.is_self ? <>
            <View style={styles.field}><Text style={styles.label}>Username</Text><TextInput value={selected.username} editable={false} style={[styles.editInput, styles.readOnlyInput]} /></View>
            {([
              ['firstName', 'First name'], ['lastName', 'Last name'], ['email', 'Email'], ['address', 'Address'], ['contactNumber', 'Contact number'],
            ] as Array<[keyof EditValues, string]>).map(([key, label]) => <View key={key} style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={values[key]} onChangeText={(value) => setValues((current) => ({ ...current, [key]: value }))} autoCapitalize={key === 'email' ? 'none' : 'sentences'} style={styles.editInput} /></View>)}
            <ErrorMessage message={error} />
            <View style={styles.actions}><PrimaryButton disabled={saving} label={saving ? 'Saving…' : 'Save Changes'} onPress={() => void save()} /><TouchableOpacity onPress={() => setEditing(false)} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity></View>
          </> : <>
            <DetailRow label="Account ID" value={selected.rescuer_id} />
            <DetailRow label="Name" value={[selected.first_name, selected.last_name].filter(Boolean).join(' ') || 'N/A'} />
            {role === 'barangay_rescuer' ? <DetailRow label="Barangay" value={selected.barangay_name || 'N/A'} /> : null}
            <DetailRow label="Username" value={selected.username || 'N/A'} />
            <DetailRow label="Email" value={selected.email || 'N/A'} />
            <DetailRow label="Contact" value={selected.contact_number || 'N/A'} />
            <DetailRow label="Address" value={selected.address || 'N/A'} />
            <DetailRow label="Status" value={selected.is_online ? 'Online' : 'Offline'} />
            <DetailRow label="Last login" value={formatLastLogin(selected.last_login)} />
            {selected.is_self ? <View style={styles.editButton}><PrimaryButton label="Edit My Profile" onPress={() => setEditing(true)} /></View> : null}
          </> : null}
          </ScrollView>
        </View></View>
      </Modal>
    </RescuerScreen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { color: rescuerColors.ink, fontSize: 18, fontWeight: '900' },
  managementHeader: { gap: 10, marginBottom: 12 },
  input: { height: 42, width: '100%', maxWidth: 420, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 12, color: '#0f172a', backgroundColor: '#fff', fontSize: 12 },
  success: { padding: 11, borderRadius: 10, backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0', color: rescuerColors.success, fontSize: 12, fontWeight: '700' },
  tableWrap: { borderRadius: 7, borderWidth: 1, borderColor: '#cbd5e1' },
  table: { minWidth: 1040 },
  tableRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#cbd5e1' },
  tableHead: { backgroundColor: '#12314b' },
  altRow: { backgroundColor: '#f8fafc' },
  selfRow: { backgroundColor: '#eff6ff' },
  cell: { width: 125, paddingHorizontal: 9, color: '#2b465b', fontSize: 10 },
  emailCell: { width: 165 },
  headText: { color: '#fff', fontWeight: '900' },
  presence: { alignSelf: 'flex-start', color: '#64748b', backgroundColor: '#e2e8f0', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4, fontSize: 9, fontWeight: '900' },
  online: { color: '#047857', backgroundColor: '#d1fae5' },
  viewButton: { alignSelf: 'flex-start', borderRadius: 6, borderWidth: 1, borderColor: '#94a3b8', paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fff' },
  viewText: { color: rescuerColors.ink, fontSize: 10, fontWeight: '900' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(2, 6, 23, 0.68)' },
  modal: { maxHeight: '92%', backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 5, borderTopColor: rescuerColors.blue },
  modalContent: { padding: 20, paddingBottom: 28 },
  modalTitle: { color: rescuerColors.ink, fontSize: 21, fontWeight: '900' },
  close: { color: rescuerColors.blue, fontSize: 12, fontWeight: '900' },
  field: { marginTop: 9 },
  label: { color: '#475569', fontSize: 10, fontWeight: '800', marginBottom: 4 },
  editInput: { height: 42, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 11, color: '#0f172a', fontSize: 12 },
  readOnlyInput: { backgroundColor: '#f1f5f9', color: '#64748b' },
  actions: { gap: 8, marginTop: 14 },
  cancel: { minHeight: 43, borderRadius: 9, borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: '#475569', fontSize: 12, fontWeight: '900' },
  editButton: { marginTop: 16 },
});
