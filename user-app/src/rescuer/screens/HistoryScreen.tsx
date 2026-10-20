import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText as Text, AppTextInput as TextInput } from '../../components/Typography';
import { Card, EmptyState, ErrorMessage, RescuerScreen, rescuerColors } from '../components/RescuerScreen';
import { loadCompleteHistory } from '../services/rescuerService';
import type { AssignmentHistory, ResponderRole } from '../types';

const PAGE_SIZE = 20;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value)?.label || value;
  return <View style={styles.filterField}><Text style={styles.filterLabel}>{label}</Text><TouchableOpacity onPress={() => setOpen(true)} style={styles.select}><Text style={styles.selectText}>{selected}</Text><Text style={styles.chevron}>⌄</Text></TouchableOpacity>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}><TouchableOpacity activeOpacity={1} onPress={() => setOpen(false)} style={styles.selectBackdrop}><View style={styles.selectModal}><Text style={styles.selectTitle}>{label}</Text><ScrollView>{options.map((option) => <TouchableOpacity key={option.value} onPress={() => { onChange(option.value); setOpen(false); }} style={[styles.option, option.value === value && styles.optionActive]}><Text style={[styles.optionText, option.value === value && styles.optionTextActive]}>{option.label}</Text></TouchableOpacity>)}</ScrollView></View></TouchableOpacity></Modal>
  </View>;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function HistoryScreen({ role, onAuthError }: { role: ResponderRole; onAuthError: () => void }) {
  const [history, setHistory] = useState<AssignmentHistory[]>([]);
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('all');
  const [year, setYear] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setHistory(await loadCompleteHistory());
      setError('');
    } catch (caught: any) {
      if (caught?.response?.status === 401) onAuthError();
      else setError(caught?.response?.data?.message || 'Unable to load assignment history.');
    } finally {
      setLoading(false);
    }
  }, [onAuthError]);

  useEffect(() => { void refresh(); }, [refresh]);

  const years = useMemo(() => Array.from(new Set(history.map((item) => new Date(item.arrived_at).getFullYear()).filter(Number.isFinite))).sort((left, right) => right - left), [history]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return history.filter((item) => {
      const completed = new Date(item.arrived_at);
      const matchesSearch = !needle || [item.report_code, item.backup_request_id, `ASN-${String(item.backup_request_id).padStart(6, '0')}`, item.id, item.reporter_name, item.assigned_barangay]
        .some((value) => String(value || '').toLowerCase().includes(needle));
      return matchesSearch && (month === 'all' || completed.getMonth() === Number(month)) && (year === 'all' || completed.getFullYear() === Number(year));
    });
  }, [history, month, search, year]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <RescuerScreen title="Assignment History" subtitle={`Complete ${role === 'barangay_rescuer' ? 'Barangay Rescuer' : 'CDRRMD Rescuer'} records`} refreshing={loading} onRefresh={() => void refresh()}>
      <ErrorMessage message={error} />
      <Card>
        <Text style={styles.title}>Complete Rescue History</Text>
        <Text style={styles.subtitle}>This page keeps all completed assignments. Incident Reports shows only the current week.</Text>
        <View style={styles.filters}>
          <View style={styles.searchField}><Text style={styles.filterLabel}>Search name or ID</Text><TextInput value={search} onChangeText={(value) => { setSearch(value); setPage(1); }} placeholder="Resident, incident, or assignment ID" placeholderTextColor="#64748b" style={styles.input} /></View>
          <SelectField label="Month" value={month} options={[{ value: 'all', label: 'All months' }, ...MONTHS.map((label, index) => ({ value: String(index), label }))]} onChange={(value) => { setMonth(value); setPage(1); }} />
          <SelectField label="Year" value={year} options={[{ value: 'all', label: 'All years' }, ...years.map((value) => ({ value: String(value), label: String(value) }))]} onChange={(value) => { setYear(value); setPage(1); }} />
          <TouchableOpacity onPress={() => { setSearch(''); setMonth('all'); setYear('all'); setPage(1); }} style={styles.clearButton}><Text style={styles.clearText}>Clear</Text></TouchableOpacity>
        </View>
        <View style={styles.summaryRow}><Text style={styles.count}>{filtered.length} of {history.length} assignments</Text><TouchableOpacity disabled={loading} onPress={() => void refresh()} style={[styles.refreshButton, loading && styles.disabled]}><Text style={styles.refreshText}>{loading ? 'Loading…' : 'Refresh'}</Text></TouchableOpacity></View>
        {!visible.length ? <EmptyState loading={loading} message="No assignment history matches the selected filters." /> : <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableWrap}>
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHead]}>{['Incident ID', 'Assignment ID', 'Resident', 'Barangay', 'Location', 'Evacuation Area', 'Assigned', 'Completed'].map((label, index) => <Text key={label} style={[styles.cell, index >= 4 && styles.wideCell, styles.headText]}>{label}</Text>)}</View>
            {visible.map((item, rowIndex) => <View key={item.backup_request_id} style={[styles.tableRow, rowIndex % 2 === 1 && styles.altRow]}>
              <Text style={[styles.cell, styles.code]}>{item.report_code}</Text><Text style={[styles.cell, styles.assignmentId]}>ASN-{String(item.backup_request_id).padStart(6, '0')}</Text><Text style={styles.cell}>{item.reporter_name || '-'}</Text><Text style={styles.cell}>{item.assigned_barangay || '-'}</Text><Text style={[styles.cell, styles.wideCell]}>{item.location || '-'}</Text><Text style={[styles.cell, styles.wideCell]}>{item.evacuation_area_name || '-'}</Text><Text style={[styles.cell, styles.wideCell]}>{item.assigned_at ? formatDate(item.assigned_at) : '-'}</Text><Text style={[styles.cell, styles.wideCell, styles.completed]}>{formatDate(item.arrived_at)}</Text>
            </View>)}
          </View>
        </ScrollView>}
        <View style={styles.pagination}>
          <TouchableOpacity disabled={page <= 1} onPress={() => setPage((value) => Math.max(1, value - 1))} style={[styles.pageButton, page <= 1 && styles.disabled]}><Text style={styles.pageButtonText}>Previous</Text></TouchableOpacity>
          <Text style={styles.pageText}>Page {page} of {totalPages}</Text>
          <TouchableOpacity disabled={page >= totalPages} onPress={() => setPage((value) => Math.min(totalPages, value + 1))} style={[styles.pageButton, page >= totalPages && styles.disabled]}><Text style={styles.pageButtonText}>Next</Text></TouchableOpacity>
        </View>
      </Card>
    </RescuerScreen>
  );
}

const styles = StyleSheet.create({
  title: { color: rescuerColors.ink, fontSize: 18, fontWeight: '900' },
  subtitle: { color: rescuerColors.muted, fontSize: 11, marginTop: 3 },
  filters: { marginTop: 13, gap: 8 },
  searchField: { flex: 1 },
  filterField: { flex: 1, minWidth: 130 },
  filterLabel: { color: '#475569', fontSize: 10, fontWeight: '900', marginBottom: 4 },
  input: { height: 44, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 12, color: '#0f172a', backgroundColor: '#fff', fontSize: 12 },
  select: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 12, backgroundColor: '#fff' },
  selectText: { color: '#334155', fontSize: 12 },
  chevron: { color: '#64748b', fontSize: 16 },
  selectBackdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(2,6,23,0.6)' },
  selectModal: { width: '100%', maxWidth: 420, maxHeight: '70%', alignSelf: 'center', borderRadius: 14, padding: 14, backgroundColor: '#fff' },
  selectTitle: { color: rescuerColors.ink, fontSize: 17, fontWeight: '900', marginBottom: 8 },
  option: { paddingHorizontal: 12, paddingVertical: 12, borderRadius: 8 },
  optionActive: { backgroundColor: '#dbeafe' },
  optionText: { color: '#334155', fontSize: 13 },
  optionTextActive: { color: '#1d4ed8', fontWeight: '900' },
  clearButton: { height: 42, alignSelf: 'flex-start', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 16 },
  clearText: { color: '#475569', fontSize: 12, fontWeight: '800' },
  summaryRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { color: rescuerColors.muted, fontSize: 11, fontWeight: '800' },
  refreshButton: { borderRadius: 8, backgroundColor: '#1f4e79', paddingHorizontal: 14, paddingVertical: 9 },
  refreshText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  tableWrap: { marginTop: 10, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1' },
  table: { minWidth: 1120 },
  tableRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#cbd5e1' },
  tableHead: { backgroundColor: '#12314b' },
  altRow: { backgroundColor: '#f8fafc' },
  cell: { width: 125, paddingHorizontal: 10, color: '#334155', fontSize: 11 },
  wideCell: { width: 175 },
  headText: { color: '#fff', fontWeight: '900' },
  code: { color: rescuerColors.ink, fontSize: 13, fontWeight: '900' },
  assignmentId: { color: rescuerColors.muted, fontSize: 10, fontWeight: '700' },
  completed: { color: rescuerColors.success, fontWeight: '800' },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  pageButton: { borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 13, paddingVertical: 9 },
  pageButtonText: { color: rescuerColors.ink, fontSize: 11, fontWeight: '800' },
  pageText: { color: rescuerColors.muted, fontSize: 11, fontWeight: '700' },
  disabled: { opacity: 0.4 },
});
