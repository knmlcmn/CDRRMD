import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../services/apiClient';
import AdminShell from '../components/AdminShell';
import { d } from '../adminDesign';
import type { BarangayAccount } from '../types';

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

type BrgyForm = {
  id: number | null;
  barangayId: string;
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  address: string;
  contactNumber: string;
  barangayName: string;
};

const EMPTY_FORM: BrgyForm = {
  id: null,
  barangayId: '',
  username: '',
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  address: '',
  contactNumber: '',
  barangayName: '',
};

function toForm(a: BarangayAccount): BrgyForm {
  return {
    id: a.id,
    barangayId: a.barangay_id || '',
    username: a.username || '',
    email: a.email || '',
    password: '',
    firstName: a.first_name || '',
    lastName: a.last_name || '',
    address: a.address || '',
    contactNumber: a.contact_number || '',
    barangayName: a.barangay_name || '',
  };
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

const ARCHIVE_ICON = 'https://cdn-icons-png.flaticon.com/512/3143/3143462.png';
const BARANGAY_OPTIONS = ['Lingga', 'Looc', 'Palingon', 'Parian', 'Sampiruhan', 'Uwisan'];

export default function BarangayAccountsPage({
  onLogout, onOpenDashboard, onOpenAdmin, onOpenUsers, onOpenBarangay, onOpenRescuers,
  onOpenMonitoring, onOpenFloodMonitoring, onOpenEvacuationAreas, onOpenPostUpdates, onAuthError,
}: Props) {
  const [accounts, setAccounts] = useState<BarangayAccount[]>([]);
  const [archivedAccounts, setArchivedAccounts] = useState<BarangayAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [barangayFilter, setBarangayFilter] = useState('all');
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [form, setForm] = useState<BrgyForm>(EMPTY_FORM);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);

  async function loadAccounts(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const res = await api.get('/barangay/accounts');
      setAccounts(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (err: any) {
      if (err?.response?.status === 401) { onAuthError(); return; }
      setError(err?.response?.data?.message || 'Failed to load barangay accounts.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    loadAccounts();
    const timer = window.setInterval(() => loadAccounts(false), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  function handleEdit(a: BarangayAccount) {
    setForm(toForm(a));
    setFormError(null);
    setIsFormOpen(true);
  }

  function handleNew() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setIsFormOpen(true);
  }

  async function loadArchivedAccounts() {
    setArchiveBusy(true);
    try {
      const res = await api.get('/barangay/accounts/archived');
      setArchivedAccounts(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      if (err?.response?.status === 401) { onAuthError(); return; }
      setError(err?.response?.data?.message || 'Failed to load archived barangay accounts.');
    } finally {
      setArchiveBusy(false);
    }
  }

  function openArchiveModal() {
    setIsArchiveOpen(true);
    loadArchivedAccounts().catch(() => {});
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.username.trim() || !form.email.trim() || !form.barangayName.trim()) {
      setFormError('Username, email and barangay name are required.');
      return;
    }
    if (!form.id && !form.password.trim()) {
      setFormError('Password is required for new accounts.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password.trim() || undefined,
        firstName: form.firstName.trim() || null,
        lastName: form.lastName.trim() || null,
        address: form.address.trim() || null,
        contactNumber: form.contactNumber.trim() || null,
        barangayName: form.barangayName.trim(),
      };
      if (form.id) {
        await api.patch(`/barangay/accounts/${form.id}`, payload);
      } else {
        await api.post('/barangay/accounts', payload);
      }
      setForm(EMPTY_FORM);
      setIsFormOpen(false);
      await loadAccounts();
    } catch (err: any) {
      if (err?.response?.status === 401) { onAuthError(); return; }
      setFormError(err?.response?.data?.message || 'Failed to save account.');
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive(id: number) {
    if (!window.confirm('Archive this barangay account?')) return;
    setBusy(true);
    try {
      await api.delete(`/barangay/accounts/${id}`);
      if (form.id === id) setForm(EMPTY_FORM);
      if (form.id === id) setIsFormOpen(false);
      await loadAccounts();
    } catch (err: any) {
      if (err?.response?.status === 401) { onAuthError(); return; }
      alert(err?.response?.data?.message || 'Failed to archive account.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore(account: BarangayAccount) {
    setArchiveBusy(true);
    try {
      await api.patch(`/barangay/accounts/${account.id}/restore`);
      await Promise.all([loadAccounts(), loadArchivedAccounts()]);
    } catch (err: any) {
      if (err?.response?.status === 401) { onAuthError(); return; }
      setError(err?.response?.data?.message || 'Failed to restore barangay account.');
    } finally {
      setArchiveBusy(false);
    }
  }

  async function handlePermanentDelete(account: BarangayAccount) {
    if (!window.confirm(`Permanently delete archived account ${account.barangay_id || account.username}? This cannot be undone.`)) return;
    setArchiveBusy(true);
    try {
      await api.delete(`/barangay/accounts/${account.id}/permanent`);
      await loadArchivedAccounts();
    } catch (err: any) {
      if (err?.response?.status === 401) { onAuthError(); return; }
      setError(err?.response?.data?.message || 'Failed to permanently delete barangay account.');
    } finally {
      setArchiveBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts
      .filter((a) => barangayFilter === 'all' || String(a.barangay_name || '').toLowerCase() === barangayFilter.toLowerCase())
      .filter((a) => {
        if (!q) return true;
        const fullName = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase();
        return fullName.includes(q) ||
          String(a.barangay_id || '').toLowerCase().includes(q) ||
          String(a.username || '').toLowerCase().includes(q) ||
          String(a.email || '').toLowerCase().includes(q) ||
          String(a.contact_number || '').toLowerCase().includes(q);
      })
      .sort((left, right) =>
        String(left.barangay_name || '').localeCompare(String(right.barangay_name || ''), undefined, { sensitivity: 'base' }) ||
        String(left.last_name || '').localeCompare(String(right.last_name || ''), undefined, { sensitivity: 'base' }) ||
        String(left.first_name || '').localeCompare(String(right.first_name || ''), undefined, { sensitivity: 'base' }) ||
        left.id - right.id,
      );
  }, [accounts, search, barangayFilter]);

  const shellProps = {
    onLogout, onOpenDashboard, onOpenAdmin, onOpenUsers, onOpenBarangay, onOpenRescuers,
    onOpenMonitoring, onOpenFloodMonitoring, onOpenEvacuationAreas, onOpenPostUpdates,
  };

  return (
    <AdminShell
      {...shellProps}
      activeView="barangay"
      title="Barangay Account Management"
      noMainScroll
      actions={<button onClick={handleNew} className={d.admin.actionAdd}>Add Barangay Account</button>}
    >
      <div className={d.admin.root}>
        <div className={d.admin.headerRow}>
          <h2 className={d.admin.title}>Barangay Accounts</h2>
          <div className={d.admin.searchRow}>
            <button type="button" onClick={openArchiveModal} className={d.admin.archiveButton}>
              <img src={ARCHIVE_ICON} alt="Archive" className={d.admin.archiveIcon} />
              Archive
            </button>
            <select
              value={barangayFilter}
              onChange={(e) => setBarangayFilter(e.target.value)}
              className={d.admin.search}
              aria-label="Filter accounts by barangay"
            >
              <option value="all">All Barangays</option>
              {BARANGAY_OPTIONS.map((barangay) => <option key={barangay} value={barangay}>{barangay}</option>)}
            </select>
            <input
              className={d.admin.search}
              placeholder="Search by ID, name, email, username, or contact"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {error ? <p className={d.page.error}>{error}</p> : null}

        {isFormOpen ? (
          <form onSubmit={handleSubmit} className={d.admin.form}>
            <div className={d.admin.idBox}>
              ID: {form.id ? (accounts.find((a) => a.id === form.id)?.barangay_id || `BRG-${form.id}`) : 'Auto-generated after create'}
            </div>

            <input
              className={d.form.inputSm}
              placeholder="Username"
              value={form.username}
              onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
              required
            />
            <input
              type="email"
              className={d.form.inputSm}
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              required
            />
            <input
              type="password"
              className={d.form.inputSm}
              placeholder={form.id ? 'Password (optional)' : 'Password'}
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              autoComplete="new-password"
              required={!form.id}
            />
            <input
              className={d.form.inputSm}
              placeholder="Barangay Name"
              value={form.barangayName}
              onChange={(e) => setForm((p) => ({ ...p, barangayName: e.target.value }))}
              list="barangay-names-list"
              required
            />
            <datalist id="barangay-names-list">
              {BARANGAY_OPTIONS.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
            <input
              className={d.form.inputSm}
              placeholder="First Name"
              value={form.firstName}
              onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
            />
            <input
              className={d.form.inputSm}
              placeholder="Last Name"
              value={form.lastName}
              onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
            />
            <input
              className={d.form.inputSm}
              placeholder="Contact Number"
              value={form.contactNumber}
              onChange={(e) => setForm((p) => ({ ...p, contactNumber: e.target.value }))}
            />
            <input
              className={d.form.inputSm}
              placeholder="Address"
              value={form.address}
              onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
            />

            {formError ? <p className={d.page.error} style={{ gridColumn: '1 / -1' }}>{formError}</p> : null}

            <div className={d.admin.formActions}>
              <button type="submit" className={d.btn.primary} disabled={busy}>
                {busy ? 'Saving…' : form.id ? 'Update Account' : 'Create Account'}
              </button>
              <button type="button" className={d.btn.secondary} onClick={() => setIsFormOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {loading ? <p className={d.page.loading}>Loading…</p> : null}

        {/* Table */}
        <div className={d.table.wrap} style={{ flex: 1 }}>
          <table className={d.table.main}>
            <thead className={d.admin.tableHead}>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th className={d.admin.thHiddenMd}>Email</th>
                <th className={d.admin.thHiddenLg}>Username</th>
                <th className={d.admin.thHiddenLg}>Contact</th>
                <th className={d.admin.thHiddenMd}>Status</th>
                <th className={d.admin.thHiddenXl}>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && !loading ? (
                <tr>
                  <td colSpan={8} className={d.table.empty}>
                    {search ? 'No accounts match your search.' : 'No barangay accounts yet.'}
                  </td>
                </tr>
              ) : null}
              {filtered.map((a) => (
                <tr
                  key={a.id}
                  className={[d.admin.row, form.id === a.id ? 'bg-sky-50' : ''].join(' ')}
                >
                  <td className="font-mono text-xs text-slate-500">{a.barangay_id || `BRG-${a.id}`}</td>
                  <td className={d.admin.truncate}>
                    {[a.first_name, a.last_name].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td className={d.admin.tdHiddenTruncateMd}>{a.email}</td>
                  <td className={d.admin.tdHiddenLg}>{a.username}</td>
                  <td className={d.admin.tdHiddenLg}>{a.contact_number || '—'}</td>
                  <td className={d.admin.tdHiddenTruncateMd}>
                    <span className={[
                      'status-chip',
                      a.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600',
                    ].join(' ')}>
                      {a.is_active ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td className={d.admin.tdHiddenTruncateXl}>{fmtDate(a.last_login)}</td>
                  <td>
                    <div className={d.admin.actions}>
                      <button
                        type="button"
                        className={d.btn.secondaryXs}
                        onClick={() => handleEdit(a)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={d.btn.dangerXs}
                        onClick={() => handleArchive(a.id)}
                        disabled={busy}
                      >
                        Archive
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isArchiveOpen ? (
          <div className={d.modal.overlay}>
            <div className={d.admin.archiveModalCard}>
              <div className={d.modal.header}>
                <h4 className={d.modal.title}>Archived Barangay Accounts</h4>
                <button type="button" onClick={() => setIsArchiveOpen(false)} className={d.modal.close}>Close</button>
              </div>
              <div className={d.admin.archiveModalBody}>
                {archiveBusy ? <p className={d.page.loading}>Loading archive...</p> : null}
                {!archiveBusy && archivedAccounts.length === 0 ? <p className={d.admin.archiveEmpty}>No archived barangay accounts.</p> : null}
                {!archiveBusy && archivedAccounts.length > 0 ? (
                  <div className={d.admin.archiveList}>
                    {archivedAccounts.map((account) => (
                      <article key={account.id} className={d.admin.archiveItem}>
                        <div>
                          <p className={d.admin.archiveName}>{`${account.first_name || ''} ${account.last_name || ''}`.trim() || account.username}</p>
                          <p className={d.admin.archiveMeta}>{account.barangay_id} · {account.barangay_name || 'No barangay'} · Archived: {fmtDate(account.archived_at)}</p>
                        </div>
                        <div className={d.admin.archiveActions}>
                          <button type="button" onClick={() => handleRestore(account)} className={[d.btn.secondaryXs, d.admin.archiveActionButton].join(' ')} disabled={archiveBusy}>Restore</button>
                          <button type="button" onClick={() => handlePermanentDelete(account)} className={[d.btn.dangerXs, d.admin.archiveActionButton].join(' ')} disabled={archiveBusy}>Permanent Delete</button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
