import { useCallback, useEffect, useMemo, useState } from 'react';
import RescuerShell from '../components/RescuerShell';
import AccountDetailsModal, { type AccountEditValues } from '../components/AccountDetailsModal';
import { api } from '../services/apiClient';
import { d } from '../adminDesign';

type Props = {
  responderRole: 'rescuer' | 'barangay_rescuer';
  onLogout: () => void;
  onAuthError: () => void;
  onOpenIncidents: () => void;
  onOpenHistory: () => void;
  onOpenFloodMonitoring: () => void;
  onOpenAccount: () => void;
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
  barangay_name?: string | null;
  is_online: boolean;
  is_self: boolean;
  last_login: string | null;
};

function toEditValues(account: RescuerAccount): AccountEditValues {
  return {
    username: account.username || '',
    email: account.email || '',
    password: '',
    firstName: account.first_name || '',
    lastName: account.last_name || '',
    address: account.address || '',
    contactNumber: account.contact_number || '',
    barangayName: '',
  };
}

export default function RescuerAccountPage(props: Props) {
  const { onAuthError, responderRole } = props;
  const [rescuers, setRescuers] = useState<RescuerAccount[]>([]);
  const [selectedRescuer, setSelectedRescuer] = useState<RescuerAccount | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadAccount = useCallback(async () => {
    try {
      const { data } = await api.get<RescuerAccount[]>('/rescuers/accounts');
      setRescuers(Array.isArray(data) ? data : []);
    } catch (caught: unknown) {
      const apiError = caught as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) onAuthError();
      else setError(apiError.response?.data?.message || 'Unable to load your account.');
    }
  }, [onAuthError]);

  useEffect(() => { void loadAccount(); }, [loadAccount]);

  async function save(values: AccountEditValues) {
    if (saving || !selectedRescuer?.is_self) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await api.put('/auth/me', {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        address: values.address,
        contactNumber: values.contactNumber,
      });
      await loadAccount();
      setSelectedRescuer(null);
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
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search by name, email, username, or contact" className={d.admin.search} />
          </div>
        </div>

        {error ? <div className={d.page.error}>{error}</div> : null}
        {message ? <div className="mb-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}

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
                  <td><div className={d.admin.actions}><button type="button" onClick={() => { setSelectedRescuer(rescuer); setError(''); setMessage(''); }} className={d.btn.secondaryXs}>View</button></div></td>
                </tr>
              ))}
              {!filteredRescuers.length ? <tr><td colSpan={8} className={d.table.empty}>No rescuer account found.</td></tr> : null}
            </tbody>
          </table>
        </div>
        {selectedRescuer ? (
          <AccountDetailsModal
            key={selectedRescuer.id}
            title={responderRole === 'barangay_rescuer' ? 'Barangay Rescuer Account' : 'CDRRMD Rescuer Account'}
            accountId={selectedRescuer.rescuer_id}
            initialValues={toEditValues(selectedRescuer)}
            details={[
              { label: 'Name', value: [selectedRescuer.first_name, selectedRescuer.last_name].filter(Boolean).join(' ') || 'N/A' },
              { label: 'Status', value: selectedRescuer.is_online ? 'Online' : 'Offline' },
              ...(responderRole === 'barangay_rescuer' ? [{ label: 'Barangay', value: selectedRescuer.barangay_name || 'N/A' }] : []),
              { label: 'Username', value: selectedRescuer.username || 'N/A' },
              { label: 'Email', value: selectedRescuer.email || 'N/A' },
              { label: 'Contact', value: selectedRescuer.contact_number || 'N/A' },
              { label: 'Address', value: selectedRescuer.address || 'N/A' },
              { label: 'Last Login', value: formatLastLogin(selectedRescuer.last_login) },
            ]}
            canEdit={selectedRescuer.is_self}
            usernameReadOnly
            showPassword={false}
            busy={saving}
            error={error}
            onClose={() => { setSelectedRescuer(null); setError(''); }}
            onSave={save}
          />
        ) : null}
      </div>
    </RescuerShell>
  );
}
