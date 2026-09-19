import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import AdminShell from '../components/AdminShell';
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
};

const EMPTY_FORM: AccountForm = {
  id: null, username: '', email: '', password: '', firstName: '', lastName: '', address: '', contactNumber: '',
};

type ApiError = { response?: { status?: number; data?: { message?: string } } };

export default function RescuerAccountsPage(props: Props) {
  const { onAuthError } = props;
  const [accounts, setAccounts] = useState<RescuerAccount[]>([]);
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadAccounts = useCallback(async () => {
    try {
      const { data } = await api.get<RescuerAccount[]>('/rescuers/accounts');
      setAccounts(Array.isArray(data) ? data : []);
      setError('');
    } catch (error: unknown) {
      const err = error as ApiError;
      if (err.response?.status === 401) return onAuthError();
      setError(err.response?.data?.message || 'Failed to load CDRRMD Rescuer accounts.');
    }
  }, [onAuthError]);

  useEffect(() => {
    void loadAccounts();
    const timer = window.setInterval(() => void loadAccounts(), 10_000);
    return () => window.clearInterval(timer);
  }, [loadAccounts]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return accounts;
    return accounts.filter((account) => [
      account.rescuer_id, account.username, account.email, account.first_name, account.last_name, account.contact_number,
    ].some((value) => String(value || '').toLowerCase().includes(needle)));
  }, [accounts, search]);

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
      };
      if (form.id) await api.patch(`/rescuers/accounts/${form.id}`, payload);
      else await api.post('/rescuers/accounts', payload);
      setShowForm(false);
      setForm(EMPTY_FORM);
      await loadAccounts();
    } catch (error: unknown) {
      const err = error as ApiError;
      if (err.response?.status === 401) return onAuthError();
      setError(err.response?.data?.message || 'Failed to save CDRRMD Rescuer account.');
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
      setError(err.response?.data?.message || 'Failed to archive CDRRMD Rescuer account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell
      {...props}
      activeView="rescuers"
      title="CDRRMD Rescuer Account Management"
      noMainScroll
      actions={<button className={d.admin.actionAdd} onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }}>Add Rescuer Team</button>}
    >
      <div className={d.admin.root}>
        <div className={d.admin.headerRow}>
          <div>
            <h2 className={d.admin.title}>CDRRMD Rescuer Teams</h2>
            <p className="text-xs text-slate-500">Only available teams can be assigned to a confirmed backup request.</p>
          </div>
          <input className={d.admin.search} placeholder="Search rescuer ID, name, or email" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        {error ? <p className={d.page.error}>{error}</p> : null}
        <div className={d.table.wrap}>
          <table className={d.table.main}>
            <thead><tr><th>Rescuer ID</th><th>Team Member</th><th>Contact</th><th>Availability</th><th>Last Login</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map((account) => (
                <tr key={account.id}>
                  <td>{account.rescuer_id}</td>
                  <td><strong>{[account.first_name, account.last_name].filter(Boolean).join(' ') || account.username}</strong><br /><span className="text-xs text-slate-500">{account.email}</span></td>
                  <td>{account.contact_number || '-'}</td>
                  <td><span className={account.is_available ? 'status-chip bg-emerald-100 text-emerald-800' : 'status-chip bg-amber-100 text-amber-800'}>{account.is_available ? 'Available' : 'Assigned'}</span></td>
                  <td>{account.last_login ? new Date(account.last_login).toLocaleString() : 'Never'}</td>
                  <td><div className="flex gap-2"><button className={d.btn.secondaryXs} onClick={() => editAccount(account)}>Edit</button><button className={d.btn.declineDisabled} disabled={busy || !account.is_available} onClick={() => void archiveAccount(account)}>Archive</button></div></td>
                </tr>
              ))}
              {!filtered.length ? <tr><td colSpan={6} className={d.table.empty}>No CDRRMD Rescuer accounts found.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      {showForm ? (
        <div className={d.modal.overlay}>
          <form className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-2xl" onSubmit={saveAccount}>
            <h3 className={`${d.modal.title} mb-4`}>{form.id ? 'Edit Rescuer Team' : 'Add Rescuer Team'}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className={d.form.input} required placeholder="Username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
              <input className={d.form.input} required type="email" placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              <input className={d.form.input} required={!form.id} type="password" placeholder={form.id ? 'New password (optional)' : 'Password'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
              <input className={d.form.input} placeholder="Contact number" value={form.contactNumber} onChange={(event) => setForm({ ...form, contactNumber: event.target.value })} />
              <input className={d.form.input} placeholder="First name" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
              <input className={d.form.input} placeholder="Last name" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
              <input className={`${d.form.input} sm:col-span-2`} placeholder="Team address/base" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className={d.btn.secondary} disabled={busy} onClick={() => setShowForm(false)}>Cancel</button>
              <button className={d.btn.primary} disabled={busy}>{busy ? 'Saving...' : 'Save Rescuer'}</button>
            </div>
          </form>
        </div>
      ) : null}
    </AdminShell>
  );
}
