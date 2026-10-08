import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import AdminShell from '../components/AdminShell';
import AddAccountDialog, { type AccountRole } from '../components/AddAccountDialog';
import { api } from '../services/apiClient';
import type { RescuerAccount } from '../types';
import { d } from '../adminDesign';

type Props = {
  onLogout: () => void;
  onOpenDashboard: () => void;
  onOpenAdmin: () => void;
  onOpenUsers: () => void;
  onOpenBarangay: () => void;
  onOpenRescuers: () => void;
  onOpenMonitoring: () => void;
  onOpenFloodMonitoring: () => void;
  onOpenEvacuationAreas: () => void;
  onOpenPostUpdates: () => void;
  onAuthError: () => void;
};

type AccountForm = {
  id: number | null;
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  address: string;
  contactNumber: string;
  barangayName: string;
};

const EMPTY_FORM: AccountForm = {
  id: null, username: '', email: '', password: '', firstName: '', lastName: '', address: '', contactNumber: '', barangayName: '',
};

type RescuerRole = 'rescuer' | 'barangay_rescuer';
const BARANGAYS = ['Palingon', 'Sampiruhan', 'Lingga', 'Parian', 'Looc', 'Uwisan'];

const ARCHIVE_ICON = 'https://cdn-icons-png.flaticon.com/512/3143/3143462.png';

type ApiError = { response?: { status?: number; data?: { message?: string } } };

export default function RescuerAccountsPage(props: Props) {
  const { onAuthError } = props;
  const [accounts, setAccounts] = useState<RescuerAccount[]>([]);
  const [archivedAccounts, setArchivedAccounts] = useState<RescuerAccount[]>([]);
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [search, setSearch] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accountRole, setAccountRole] = useState<RescuerRole>('rescuer');
  const isBarangayRescuer = accountRole === 'barangay_rescuer';
  const accountLabel = isBarangayRescuer ? 'Barangay Rescuer' : 'Rescuer';

  const loadAccounts = useCallback(async () => {
    try {
      const { data } = await api.get<RescuerAccount[]>('/rescuers/accounts', { params: { role: accountRole } });
      setAccounts(Array.isArray(data) ? data : []);
      setError('');
    } catch (error: unknown) {
      const err = error as ApiError;
      if (err.response?.status === 401) return onAuthError();
      setError(err.response?.data?.message || `Failed to load ${accountLabel} accounts.`);
    } finally {
      setLoading(false);
    }
  }, [accountLabel, accountRole, onAuthError]);

  useEffect(() => {
    void loadAccounts();
    const timer = window.setInterval(() => void loadAccounts(), 10_000);
    return () => window.clearInterval(timer);
  }, [loadAccounts]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return accounts
      .filter((account) => availabilityFilter === 'all' || (availabilityFilter === 'available' ? account.is_available : !account.is_available))
      .filter((account) => !needle || [
        account.rescuer_id, account.username, account.email, account.first_name, account.last_name, account.contact_number, account.barangay_name,
      ].some((value) => String(value || '').toLowerCase().includes(needle)));
  }, [accounts, availabilityFilter, search]);

  function editAccount(account: RescuerAccount) {
    setForm({
      id: account.id,
      username: account.username,
      email: account.email,
      password: '',
      firstName: account.first_name || '',
      lastName: account.last_name || '',
      address: account.address || '',
      contactNumber: account.contact_number || '',
      barangayName: account.barangay_name || '',
    });
    setShowForm(true);
  }

  async function saveAccount(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        username: form.username.trim(), email: form.email.trim(), password: form.password,
        firstName: form.firstName.trim(), lastName: form.lastName.trim(),
        address: form.address.trim(), contactNumber: form.contactNumber.trim(),
        role: accountRole, barangayName: form.barangayName,
      };
      if (!form.id) return;
      await api.patch(`/rescuers/accounts/${form.id}`, payload);
      setShowForm(false);
      setForm(EMPTY_FORM);
      await loadAccounts();
    } catch (error: unknown) {
      const err = error as ApiError;
      if (err.response?.status === 401) return onAuthError();
      setError(err.response?.data?.message || `Failed to save ${accountLabel} account.`);
    } finally {
      setBusy(false);
    }
  }

  async function archiveAccount(account: RescuerAccount) {
    if (!window.confirm(`Archive ${account.rescuer_id}?`)) return;
    setBusy(true);
    try {
      await api.delete(`/rescuers/accounts/${account.id}`);
      await loadAccounts();
    } catch (error: unknown) {
      const err = error as ApiError;
      setError(err.response?.data?.message || `Failed to archive ${accountLabel} account.`);
    } finally {
      setBusy(false);
    }
  }

  async function loadArchivedAccounts() {
    setArchiveBusy(true);
    try {
      const { data } = await api.get<RescuerAccount[]>('/rescuers/accounts/archived', { params: { role: accountRole } });
      setArchivedAccounts(Array.isArray(data) ? data : []);
    } catch (error: unknown) {
      const err = error as ApiError;
      if (err.response?.status === 401) return onAuthError();
      setError(err.response?.data?.message || `Failed to load archived ${accountLabel} accounts.`);
    } finally {
      setArchiveBusy(false);
    }
  }

  async function restoreAccount(account: RescuerAccount) {
    setArchiveBusy(true);
    try {
      await api.patch(`/rescuers/accounts/${account.id}/restore`);
      await Promise.all([loadAccounts(), loadArchivedAccounts()]);
    } catch (error: unknown) {
      const err = error as ApiError;
      setError(err.response?.data?.message || `Failed to restore ${accountLabel} account.`);
    } finally {
      setArchiveBusy(false);
    }
  }

  async function permanentlyDeleteAccount(account: RescuerAccount) {
    if (!window.confirm(`Permanently delete archived account ${account.rescuer_id}? This cannot be undone.`)) return;
    setArchiveBusy(true);
    try {
      await api.delete(`/rescuers/accounts/${account.id}/permanent`);
      await loadArchivedAccounts();
    } catch (error: unknown) {
      const err = error as ApiError;
      setError(err.response?.data?.message || `Failed to permanently delete ${accountLabel} account.`);
    } finally {
      setArchiveBusy(false);
    }
  }

  function formatDate(value?: string | null) {
    return value ? new Date(value).toLocaleString() : '—';
  }

  function selectAccountRole(role: RescuerRole) {
    setAccountRole(role);
    setAccounts([]);
    setArchivedAccounts([]);
    setForm(EMPTY_FORM);
    setShowForm(false);
    setShowArchive(false);
    setSearch('');
    setAvailabilityFilter('all');
    setError('');
    setLoading(true);
  }

  async function handleCreated(role: AccountRole) {
    if (role === 'rescuer') return loadAccounts();
    if (role === 'admin') return props.onOpenAdmin();
    if (role === 'user') return props.onOpenUsers();
    return props.onOpenBarangay();
  }

  return (
    <AdminShell
      {...props}
      activeView="rescuers"
      title="Account Management"
      noMainScroll
    >
      <div className={d.admin.root}>
        <div className={d.admin.headerRow}>
          <div>
            <h2 className={d.admin.title}>{accountLabel} Accounts</h2>
            <div className="mt-2 flex flex-wrap gap-2" role="tablist" aria-label="Rescuer account type">
              <button type="button" role="tab" aria-selected={!isBarangayRescuer} onClick={() => selectAccountRole('rescuer')} className={[d.monitoring.filterBase, !isBarangayRescuer ? d.monitoring.filterActive : d.monitoring.filterIdle].join(' ')}>Rescuers</button>
              <button type="button" role="tab" aria-selected={isBarangayRescuer} onClick={() => selectAccountRole('barangay_rescuer')} className={[d.monitoring.filterBase, isBarangayRescuer ? d.monitoring.filterActive : d.monitoring.filterIdle].join(' ')}>Barangay Rescuers</button>
            </div>
          </div>
          <div className={d.admin.searchRow}>
            <button type="button" onClick={() => { setShowArchive(true); void loadArchivedAccounts(); }} className={d.admin.archiveButton}><img src={ARCHIVE_ICON} alt="Archive" className={d.admin.archiveIcon} /> Archive</button>
            <select value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value)} className={d.admin.search} aria-label="Filter rescuer accounts by availability"><option value="all">All Rescuers</option><option value="available">Available</option><option value="assigned">Assigned</option></select>
            <input className={d.admin.search} placeholder={`Search ${accountLabel} Account`} value={search} onChange={(event) => setSearch(event.target.value)} />
            <AddAccountDialog initialRole="rescuer" initialRescuerRole={accountRole} onCreated={handleCreated} onAuthError={onAuthError} />
          </div>
        </div>
        {error ? <p className={d.page.error}>{error}</p> : null}

        {showForm ? (
          <form className={d.admin.form} onSubmit={saveAccount}>
            <div className={d.admin.idBox}>ID: {accounts.find((account) => account.id === form.id)?.rescuer_id || `${isBarangayRescuer ? 'BRS' : 'RSC'}-${form.id}`}</div>
            <input className={d.form.inputSm} required placeholder="Username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
            <input className={d.form.inputSm} required type="email" placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            <input className={d.form.inputSm} required={!form.id} type="password" placeholder={form.id ? 'Password (optional)' : 'Password'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
            <input className={d.form.inputSm} placeholder="First Name" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
            <input className={d.form.inputSm} placeholder="Last Name" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
            <input className={d.form.inputSm} placeholder="Contact Number" value={form.contactNumber} onChange={(event) => setForm({ ...form, contactNumber: event.target.value })} />
            <input className={d.form.inputSm} placeholder="Address / Team Base" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
            {isBarangayRescuer ? (
              <select className={d.form.inputSm} required aria-label="Assigned barangay" value={form.barangayName} onChange={(event) => setForm({ ...form, barangayName: event.target.value })}>
                {BARANGAYS.map((barangay) => <option key={barangay} value={barangay}>{barangay}</option>)}
              </select>
            ) : null}
            <div className={d.admin.formActions}><button className={d.btn.primary} disabled={busy}>{busy ? 'Saving…' : 'Update Account'}</button><button type="button" className={d.btn.secondary} onClick={() => setShowForm(false)}>Cancel</button></div>
          </form>
        ) : null}

        {loading ? <p className={d.page.loading}>Loading…</p> : null}
        <div className={d.table.wrap} style={{ flex: 1 }}>
          <table className={d.table.main}>
            <thead className={d.admin.tableHead}><tr><th>ID</th><th>Name</th>{isBarangayRescuer ? <th className={d.admin.thHiddenMd}>Barangay</th> : null}<th className={d.admin.thHiddenMd}>Email</th><th className={d.admin.thHiddenLg}>Username</th><th className={d.admin.thHiddenLg}>Contact</th><th className={d.admin.thHiddenMd}>Status</th><th className={d.admin.thHiddenXl}>Last Login</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map((account) => (
                <tr key={account.id} className={[d.admin.row, form.id === account.id ? 'bg-sky-50' : ''].join(' ')}>
                  <td className="font-mono text-xs text-slate-500">{account.rescuer_id}</td>
                  <td className={d.admin.truncate}>{[account.first_name, account.last_name].filter(Boolean).join(' ') || '—'}</td>
                  {isBarangayRescuer ? <td className={d.admin.tdHiddenTruncateMd}>{account.barangay_name || 'Not assigned'}</td> : null}
                  <td className={d.admin.tdHiddenTruncateMd}>{account.email}</td>
                  <td className={d.admin.tdHiddenLg}>{account.username}</td>
                  <td className={d.admin.tdHiddenLg}>{account.contact_number || '—'}</td>
                  <td className={d.admin.tdHiddenTruncateMd}><span className={['status-chip', account.is_online ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'].join(' ')}>{account.is_online ? 'Online' : 'Offline'}</span></td>
                  <td className={d.admin.tdHiddenTruncateXl}>{formatDate(account.last_login)}</td>
                  <td><div className={d.admin.actions}><button className={d.btn.secondaryXs} onClick={() => editAccount(account)}>Edit</button><button className={d.btn.dangerXs} disabled={busy || !account.is_available} onClick={() => void archiveAccount(account)}>Archive</button></div></td>
                </tr>
              ))}
              {!filtered.length && !loading ? <tr><td colSpan={isBarangayRescuer ? 9 : 8} className={d.table.empty}>{search ? 'No accounts match your search.' : `No ${accountLabel} accounts yet.`}</td></tr> : null}
            </tbody>
          </table>
        </div>

        {showArchive ? <div className={d.modal.overlay}><div className={d.admin.archiveModalCard}><div className={d.modal.header}><h4 className={d.modal.title}>Archived {accountLabel} Accounts</h4><button type="button" onClick={() => setShowArchive(false)} className={d.modal.close}>Close</button></div><div className={d.admin.archiveModalBody}>{archiveBusy ? <p className={d.page.loading}>Loading archive...</p> : null}{!archiveBusy && !archivedAccounts.length ? <p className={d.admin.archiveEmpty}>No archived {accountLabel} accounts.</p> : null}{!archiveBusy && archivedAccounts.length ? <div className={d.admin.archiveList}>{archivedAccounts.map((account) => <article key={account.id} className={d.admin.archiveItem}><div><p className={d.admin.archiveName}>{[account.first_name, account.last_name].filter(Boolean).join(' ') || account.username}</p><p className={d.admin.archiveMeta}>{account.rescuer_id}{account.barangay_name ? ` · ${account.barangay_name}` : ''} · Archived: {formatDate(account.archived_at)}</p></div><div className={d.admin.archiveActions}><button type="button" onClick={() => void restoreAccount(account)} className={[d.btn.secondaryXs, d.admin.archiveActionButton].join(' ')} disabled={archiveBusy}>Restore</button><button type="button" onClick={() => void permanentlyDeleteAccount(account)} className={[d.btn.dangerXs, d.admin.archiveActionButton].join(' ')} disabled={archiveBusy}>Permanent Delete</button></div></article>)}</div> : null}</div></div></div> : null}
      </div>
    </AdminShell>
  );
}
