import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import RescuerShell from '../components/RescuerShell';
import { api } from '../services/apiClient';
import { d } from '../adminDesign';

type Props = {
  responderRole: 'rescuer' | 'barangay_rescuer';
  onLogout: () => void;
  onAuthError: () => void;
  onOpenIncidents: () => void;
  onOpenFloodMonitoring: () => void;
  onOpenAccount: () => void;
};

type Account = {
  accountId: string | null;
  username: string;
  role: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  address: string | null;
  contactNumber: string | null;
};

type RescuerAccount = {
  id: number;
  rescuer_id: string;
  username: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  address: string | null;
  contact_number: string | null;
  is_online: boolean;
  is_self: boolean;
  last_login: string | null;
};

const emptyForm = { firstName: '', lastName: '', email: '', address: '', contactNumber: '' };

export default function RescuerAccountPage(props: Props) {
  const { onAuthError } = props;
  const [account, setAccount] = useState<Account | null>(null);
  const [rescuers, setRescuers] = useState<RescuerAccount[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadAccount = useCallback(async () => {
    try {
      const [profileResponse, accountsResponse] = await Promise.all([
        api.get<{ user: Account }>('/auth/me'),
        api.get<RescuerAccount[]>('/rescuers/accounts'),
      ]);
      const { user } = profileResponse.data;
      setAccount(user);
      setRescuers(Array.isArray(accountsResponse.data) ? accountsResponse.data : []);
      setForm({
        firstName: user.firstName || '', lastName: user.lastName || '',
        email: user.email || '', address: user.address || '', contactNumber: user.contactNumber || '',
      });
    } catch (caught: unknown) {
      const apiError = caught as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) onAuthError();
      else setError(apiError.response?.data?.message || 'Unable to load your account.');
    }
  }, [onAuthError]);

  useEffect(() => { void loadAccount(); }, [loadAccount]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const { data } = await api.put<{ user: Account }>('/auth/me', form);
      setAccount(data.user);
      await loadAccount();
      setIsFormOpen(false);
      setMessage('Your account information was updated.');
    } catch (caught: unknown) {
      const apiError = caught as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) onAuthError();
      else setError(apiError.response?.data?.message || 'Unable to update your account.');
    } finally {
      setSaving(false);
    }
  }

  const filteredRescuers = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return rescuers;
    return rescuers.filter((rescuer) => [
      rescuer.rescuer_id,
      rescuer.first_name,
      rescuer.last_name,
      rescuer.email,
      rescuer.username,
      rescuer.contact_number,
    ].some((value) => String(value || '').toLowerCase().includes(needle)));
  }, [rescuers, searchTerm]);

  function formatLastLogin(value?: string | null) {
    if (!value) return 'Never';
    return new Date(value).toLocaleString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  }

  return (
    <RescuerShell activeView="account" title="Account" subtitle="View fellow rescuers and manage only your own account" {...props}>
      <div className={d.admin.root}>
        <div className={d.admin.headerRow}>
          <h2 className={d.admin.title}>Rescuer Account Management</h2>
          <div className={d.admin.searchRow}>
            <button type="button" onClick={() => { setError(''); setMessage(''); setIsFormOpen(true); }} className={d.admin.actionAdd}>Edit My Profile</button>
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search by name, email, username, or contact" className={d.admin.search} />
          </div>
        </div>

        {error ? <div className={d.page.error}>{error}</div> : null}
        {message ? <div className="mb-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}

        {isFormOpen ? (
          <form onSubmit={save} className={d.admin.form}>
            <div className={d.admin.idBox}>Editing: {account?.accountId || 'CDRRMD Rescuer Account'}</div>
            <input value={form.firstName} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} placeholder="First Name" className={d.form.inputSm} />
            <input value={form.lastName} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} placeholder="Last Name" className={d.form.inputSm} />
            <input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" type="email" className={d.form.inputSm} required />
            <input value={form.contactNumber} onChange={(event) => setForm((current) => ({ ...current, contactNumber: event.target.value }))} placeholder="Contact Number" className={d.form.inputSm} />
            <input value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} placeholder="Address" className={d.form.inputSm} />
            <div className={d.admin.formActions}>
              <button disabled={saving || !account} className={d.btn.emerald}>{saving ? 'Saving...' : 'Save Changes'}</button>
              <button type="button" onClick={() => setIsFormOpen(false)} className={d.btn.secondary}>Cancel</button>
            </div>
          </form>
        ) : null}

        <div className={d.table.wrap}>
          <table className={d.table.main}>
            <thead className={d.admin.tableHead}><tr><th>ID</th><th>Name</th><th className={d.admin.thHiddenMd}>Email</th><th className={d.admin.thHiddenLg}>Username</th><th className={d.admin.thHiddenLg}>Contact</th><th className={d.admin.thHiddenMd}>Status</th><th className={d.admin.thHiddenXl}>Last Login</th><th>Actions</th></tr></thead>
            <tbody>
              {filteredRescuers.map((rescuer) => (
                <tr key={rescuer.id} className={[d.admin.row, rescuer.is_self ? 'bg-blue-50' : ''].join(' ')}>
                  <td><span>{rescuer.rescuer_id}</span>{rescuer.is_self ? <span className="ml-1 rounded border border-blue-200 bg-blue-50 px-1 py-0.5 text-[10px] font-bold text-blue-600">You</span> : null}</td>
                  <td className={d.admin.truncate}>{[rescuer.first_name, rescuer.last_name].filter(Boolean).join(' ') || 'N/A'}</td>
                  <td className={d.admin.tdHiddenTruncateMd}>{rescuer.email || 'N/A'}</td>
                  <td className={d.admin.tdHiddenLg}>{rescuer.username || 'N/A'}</td>
                  <td className={d.admin.tdHiddenLg}>{rescuer.contact_number || 'N/A'}</td>
                  <td className={d.admin.thHiddenMd}><span className={['status-chip', rescuer.is_online ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'].join(' ')}>{rescuer.is_online ? 'Online' : 'Offline'}</span></td>
                  <td className={`${d.admin.tdHiddenTruncateXl} text-xs text-slate-500`}>{formatLastLogin(rescuer.last_login)}</td>
                  <td><div className={d.admin.actions}>{rescuer.is_self ? <button type="button" onClick={() => setIsFormOpen(true)} className={d.btn.secondaryXs}>Edit</button> : <span className="text-slate-400">-</span>}</div></td>
                </tr>
              ))}
              {!filteredRescuers.length ? <tr><td colSpan={8} className={d.table.empty}>No rescuer account found.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </RescuerShell>
  );
}
