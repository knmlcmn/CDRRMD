import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../../services/apiClient';
import BarangayShell from '../components/BarangayShell';
import { d } from '../barangayDesign';
import type { BarangayUser, RescuerAccount } from '../../types';

type Props = {
  barangayName: string;
  onLogout: () => void;
  onOpenDashboard: () => void;
  onOpenMonitoring: () => void;
  onOpenFloodMonitoring: () => void;
  onOpenEvacuationCenter: () => void;
  onAuthError: () => void;
};

type ProfileForm = {
  firstName: string;
  lastName: string;
  email: string;
  address: string;
  contactNumber: string;
  password: string;
};

type PersonnelForm = ProfileForm & { username: string };
type ModalName = 'profile' | 'personnel' | null;
type ApiError = { response?: { status?: number; data?: { message?: string } } };

type AccountRow = {
  key: string;
  accountId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  username: string;
  contactNumber: string | null;
  isOnline: boolean;
  lastLogin: string | null;
  isSelf: boolean;
};

const EMPTY_PROFILE: ProfileForm = {
  firstName: '', lastName: '', email: '', address: '', contactNumber: '', password: '',
};

const EMPTY_PERSONNEL: PersonnelForm = { ...EMPTY_PROFILE, username: '' };

function formatLastLogin(iso?: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function profileFromUser(user: BarangayUser): ProfileForm {
  return {
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    email: user.email || '',
    address: user.address || '',
    contactNumber: user.contactNumber || '',
    password: '',
  };
}

function accountIdForUser(user: BarangayUser): string {
  const year = user.createdAt ? new Date(user.createdAt).getFullYear() : null;
  return year
    ? `BRG-${year}-${String(user.id).padStart(5, '0')}`
    : `BRG-${String(user.id).padStart(5, '0')}`;
}

export default function PersonnelAccountsPage({ barangayName, onLogout, onOpenDashboard, onOpenMonitoring, onOpenFloodMonitoring, onOpenEvacuationCenter, onAuthError }: Props) {
  const [user, setUser] = useState<BarangayUser | null>(null);
  const [personnel, setPersonnel] = useState<RescuerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<ModalName>(null);
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [profileForm, setProfileForm] = useState<ProfileForm>(EMPTY_PROFILE);
  const [personnelForm, setPersonnelForm] = useState<PersonnelForm>(EMPTY_PERSONNEL);

  const loadAccounts = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const [profileResponse, personnelResponse] = await Promise.all([
        api.get<BarangayUser>('/barangay/me'),
        api.get<RescuerAccount[]>('/barangay/personnel'),
      ]);
      setUser(profileResponse.data);
      setProfileForm(profileFromUser(profileResponse.data));
      setPersonnel(Array.isArray(personnelResponse.data) ? personnelResponse.data : []);
      setError('');
    } catch (error: unknown) {
      const err = error as ApiError;
      if (err.response?.status === 401) {
        onAuthError();
        return;
      }
      setError(err.response?.data?.message || 'We could not load the accounts. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [onAuthError]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    if (!modal) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) {
        setModal(null);
        setModalError('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modal, saving]);

  const rows = useMemo<AccountRow[]>(() => {
    const result: AccountRow[] = [];
    if (user) {
      result.push({
        key: `self-${user.id}`,
        accountId: accountIdForUser(user),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        username: user.username,
        contactNumber: user.contactNumber,
        isOnline: user.isActive !== false,
        lastLogin: user.lastLogin || null,
        isSelf: true,
      });
    }
    personnel.forEach((account) => {
      result.push({
        key: `personnel-${account.id}`,
        accountId: account.rescuer_id,
        firstName: account.first_name,
        lastName: account.last_name,
        email: account.email,
        username: account.username,
        contactNumber: account.contact_number,
        isOnline: account.is_online,
        lastLogin: account.last_login,
        isSelf: false,
      });
    });
    return result;
  }, [personnel, user]);

  const myAccountRow = rows.find((row) => row.isSelf) || null;

  const filteredPersonnelRows = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    const personnelRows = rows.filter((row) => !row.isSelf);
    if (!needle) return personnelRows;
    return personnelRows.filter((row) => [
      row.accountId, row.firstName, row.lastName, row.email,
      row.username, row.contactNumber,
    ].some((value) => String(value || '').toLowerCase().includes(needle)));
  }, [rows, searchTerm]);

  function openProfileModal() {
    if (!user) return;
    setProfileForm(profileFromUser(user));
    setModalError('');
    setSuccessMessage('');
    setModal('profile');
  }

  function openPersonnelModal() {
    setPersonnelForm(EMPTY_PERSONNEL);
    setModalError('');
    setSuccessMessage('');
    setModal('personnel');
  }

  function closeModal() {
    if (saving) return;
    setModal(null);
    setModalError('');
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setModalError('');
    try {
      await api.patch('/barangay/me', {
        firstName: profileForm.firstName.trim() || null,
        lastName: profileForm.lastName.trim() || null,
        email: profileForm.email.trim().toLowerCase(),
        address: profileForm.address.trim() || null,
        contactNumber: profileForm.contactNumber.trim() || null,
        ...(profileForm.password ? { password: profileForm.password } : {}),
      });
      setModal(null);
      setSuccessMessage('Your account was updated.');
      await loadAccounts(false);
    } catch (error: unknown) {
      const err = error as ApiError;
      if (err.response?.status === 401) {
        onAuthError();
        return;
      }
      setModalError(err.response?.data?.message || 'We could not save your changes. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function addPersonnel(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setModalError('');
    try {
      await api.post('/barangay/personnel', {
        firstName: personnelForm.firstName.trim(),
        lastName: personnelForm.lastName.trim(),
        username: personnelForm.username.trim(),
        email: personnelForm.email.trim().toLowerCase(),
        contactNumber: personnelForm.contactNumber.trim() || null,
        address: personnelForm.address.trim() || null,
        password: personnelForm.password,
      });
      const displayName = `${personnelForm.firstName.trim()} ${personnelForm.lastName.trim()}`;
      setModal(null);
      setPersonnelForm(EMPTY_PERSONNEL);
      setSuccessMessage(`${displayName} was added as a Barangay Rescuer.`);
      await loadAccounts(false);
    } catch (error: unknown) {
      const err = error as ApiError;
      if (err.response?.status === 401) {
        onAuthError();
        return;
      }
      setModalError(err.response?.data?.message || 'We could not add this personnel account. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <BarangayShell
      activeView="account"
      title="Barangay Account Management"
      barangayName={barangayName}
      onLogout={onLogout}
      onOpenDashboard={onOpenDashboard}
      onOpenMonitoring={onOpenMonitoring}
      onOpenFloodMonitoring={onOpenFloodMonitoring}
      onOpenEvacuationCenter={onOpenEvacuationCenter}
      onOpenAccount={() => {}}
    >
      <div className={d.admin.root}>
        {error ? <div className={`${d.page.error} mb-2`} role="alert">{error}</div> : null}
        {successMessage ? <div className="mb-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">{successMessage}</div> : null}
        {loading ? <p className={d.page.loading}>Loading accounts...</p> : null}

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <section aria-labelledby="my-account-heading" className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-3">
              <h2 id="my-account-heading" className={d.admin.title}>My Account</h2>
              <p className="mt-1 text-sm text-slate-500">Your Barangay {barangayName} web portal account.</p>
            </div>
            <div className="overflow-auto rounded-md border border-slate-300 bg-white">
              <table className={d.table.main}>
                <caption className="sr-only">My barangay portal account</caption>
                <thead className={d.admin.tableHead}>
                  <tr><th>ID</th><th>Name</th><th className={d.admin.thHiddenMd}>Email</th><th className={d.admin.thHiddenLg}>Username</th><th className={d.admin.thHiddenLg}>Contact</th><th className={d.admin.thHiddenMd}>Status</th><th className={d.admin.thHiddenXl}>Last Login</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {!loading && myAccountRow ? (
                    <tr className={d.admin.row}>
                      <td className="font-mono text-xs text-slate-500">{myAccountRow.accountId}</td>
                      <td className={d.admin.truncate}>{`${myAccountRow.firstName || ''} ${myAccountRow.lastName || ''}`.trim() || 'Not provided'}</td>
                      <td className={d.admin.tdHiddenTruncateMd}>{myAccountRow.email}</td>
                      <td className={d.admin.tdHiddenLg}>{myAccountRow.username}</td>
                      <td className={d.admin.tdHiddenLg}>{myAccountRow.contactNumber || 'Not provided'}</td>
                      <td className={d.admin.thHiddenMd}><span className={['status-chip', myAccountRow.isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'].join(' ')}>{myAccountRow.isOnline ? 'Online' : 'Offline'}</span></td>
                      <td className={`${d.admin.tdHiddenTruncateXl} text-xs text-slate-500`}>{formatLastLogin(myAccountRow.lastLogin)}</td>
                      <td><button type="button" onClick={openProfileModal} className={d.btn.secondaryXs}>Edit My Account</button></td>
                    </tr>
                  ) : null}
                  {!loading && !myAccountRow ? <tr><td colSpan={8} className={d.table.empty}>Your account could not be found.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="barangay-rescuers-heading" className="flex min-h-[18rem] flex-col rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className={`${d.admin.headerRow} mb-3`}>
              <div>
                <h2 id="barangay-rescuers-heading" className={d.admin.title}>Barangay Rescuers</h2>
                <p className="mt-1 text-sm text-slate-500">Rescuer accounts assigned only to Barangay {barangayName}.</p>
              </div>
              <div className={d.admin.searchRow}>
                <button type="button" onClick={openPersonnelModal} className={d.admin.actionAdd}>Add Personnel</button>
                <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search barangay rescuers" aria-label="Search barangay rescuers" className={d.admin.search} />
              </div>
            </div>
            <div className={d.table.wrap}>
              <table className={d.table.main}>
                <caption className="sr-only">Barangay rescuer accounts</caption>
                <thead className={d.admin.tableHead}>
                  <tr><th>ID</th><th>Name</th><th className={d.admin.thHiddenMd}>Email</th><th className={d.admin.thHiddenLg}>Username</th><th className={d.admin.thHiddenLg}>Contact</th><th className={d.admin.thHiddenMd}>Status</th><th className={d.admin.thHiddenXl}>Last Login</th></tr>
                </thead>
                <tbody>
                  {!loading && filteredPersonnelRows.map((row) => (
                    <tr key={row.key} className={d.admin.row}>
                      <td className="font-mono text-xs text-slate-500">{row.accountId}</td>
                      <td className={d.admin.truncate}>{`${row.firstName || ''} ${row.lastName || ''}`.trim() || 'Not provided'}</td>
                      <td className={d.admin.tdHiddenTruncateMd}>{row.email}</td>
                      <td className={d.admin.tdHiddenLg}>{row.username}</td>
                      <td className={d.admin.tdHiddenLg}>{row.contactNumber || 'Not provided'}</td>
                      <td className={d.admin.thHiddenMd}><span className={['status-chip', row.isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'].join(' ')}>{row.isOnline ? 'Online' : 'Offline'}</span></td>
                      <td className={`${d.admin.tdHiddenTruncateXl} text-xs text-slate-500`}>{formatLastLogin(row.lastLogin)}</td>
                    </tr>
                  ))}
                  {!loading && filteredPersonnelRows.length === 0 ? (
                    <tr><td colSpan={7} className={d.table.empty}>{searchTerm.trim() ? 'No rescuers match your search.' : 'No Barangay Rescuer accounts yet. Select Add Personnel to create one.'}</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {modal === 'profile' && user ? (
          <div className={d.modal.overlay} role="dialog" aria-modal="true" aria-labelledby="edit-account-title" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
            <form onSubmit={saveProfile} className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                <div><h3 id="edit-account-title" className="text-lg font-black text-[#19374f]">Edit My Account</h3><p className="mt-1 text-sm text-slate-500">Update the contact details used for this barangay portal.</p></div>
                <button type="button" onClick={closeModal} disabled={saving} className={d.modal.close} aria-label="Close edit account window">Close</button>
              </div>
              <div className="max-h-[70dvh] overflow-y-auto px-5 py-4">
                <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900"><span className="font-bold">Username:</span> {user.username}<br /><span className="font-bold">Barangay:</span> {barangayName}</div>
                {modalError ? <div className={`${d.page.error} mb-4`} role="alert">{modalError}</div> : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-semibold text-slate-700">First name<input autoFocus value={profileForm.firstName} onChange={(event) => setProfileForm({ ...profileForm, firstName: event.target.value })} className={`${d.form.input} mt-1`} autoComplete="given-name" /></label>
                  <label className="text-sm font-semibold text-slate-700">Last name<input value={profileForm.lastName} onChange={(event) => setProfileForm({ ...profileForm, lastName: event.target.value })} className={`${d.form.input} mt-1`} autoComplete="family-name" /></label>
                  <label className="text-sm font-semibold text-slate-700">Email address <span className="text-red-600">*</span><input required type="email" value={profileForm.email} onChange={(event) => setProfileForm({ ...profileForm, email: event.target.value })} className={`${d.form.input} mt-1`} autoComplete="email" /></label>
                  <label className="text-sm font-semibold text-slate-700">Contact number<input type="tel" value={profileForm.contactNumber} onChange={(event) => setProfileForm({ ...profileForm, contactNumber: event.target.value })} className={`${d.form.input} mt-1`} autoComplete="tel" /></label>
                  <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Address<input value={profileForm.address} onChange={(event) => setProfileForm({ ...profileForm, address: event.target.value })} className={`${d.form.input} mt-1`} autoComplete="street-address" /></label>
                  <label className="text-sm font-semibold text-slate-700 sm:col-span-2">New password <span className="font-normal text-slate-500">(optional)</span><input type="password" minLength={6} value={profileForm.password} onChange={(event) => setProfileForm({ ...profileForm, password: event.target.value })} className={`${d.form.input} mt-1`} autoComplete="new-password" placeholder="Leave blank to keep your current password" /><span className="mt-1 block text-xs font-normal text-slate-500">Use at least 6 characters.</span></label>
                </div>
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end"><button type="button" onClick={closeModal} disabled={saving} className={d.btn.secondary}>Cancel</button><button type="submit" disabled={saving} className={d.btn.primary}>{saving ? 'Saving...' : 'Save Changes'}</button></div>
            </form>
          </div>
        ) : null}

        {modal === 'personnel' ? (
          <div className={d.modal.overlay} role="dialog" aria-modal="true" aria-labelledby="add-personnel-title" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
            <form onSubmit={addPersonnel} className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                <div><h3 id="add-personnel-title" className="text-lg font-black text-[#19374f]">Add Barangay Rescuer</h3><p className="mt-1 text-sm text-slate-500">Create a sign-in account for a member of your rescue team.</p></div>
                <button type="button" onClick={closeModal} disabled={saving} className={d.modal.close} aria-label="Close add personnel window">Close</button>
              </div>
              <div className="max-h-[70dvh] overflow-y-auto px-5 py-4">
                <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">This rescuer will only receive assignments for <span className="font-bold">Barangay {barangayName}</span>.</div>
                {modalError ? <div className={`${d.page.error} mb-4`} role="alert">{modalError}</div> : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-semibold text-slate-700">First name <span className="text-red-600">*</span><input autoFocus required value={personnelForm.firstName} onChange={(event) => setPersonnelForm({ ...personnelForm, firstName: event.target.value })} className={`${d.form.input} mt-1`} autoComplete="given-name" /></label>
                  <label className="text-sm font-semibold text-slate-700">Last name <span className="text-red-600">*</span><input required value={personnelForm.lastName} onChange={(event) => setPersonnelForm({ ...personnelForm, lastName: event.target.value })} className={`${d.form.input} mt-1`} autoComplete="family-name" /></label>
                  <label className="text-sm font-semibold text-slate-700">Username <span className="text-red-600">*</span><input required value={personnelForm.username} onChange={(event) => setPersonnelForm({ ...personnelForm, username: event.target.value })} className={`${d.form.input} mt-1`} autoComplete="username" /></label>
                  <label className="text-sm font-semibold text-slate-700">Email address <span className="text-red-600">*</span><input required type="email" value={personnelForm.email} onChange={(event) => setPersonnelForm({ ...personnelForm, email: event.target.value })} className={`${d.form.input} mt-1`} autoComplete="email" /></label>
                  <label className="text-sm font-semibold text-slate-700">Contact number<input type="tel" value={personnelForm.contactNumber} onChange={(event) => setPersonnelForm({ ...personnelForm, contactNumber: event.target.value })} className={`${d.form.input} mt-1`} autoComplete="tel" /></label>
                  <label className="text-sm font-semibold text-slate-700">Team base or address<input value={personnelForm.address} onChange={(event) => setPersonnelForm({ ...personnelForm, address: event.target.value })} className={`${d.form.input} mt-1`} autoComplete="street-address" /></label>
                  <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Temporary password <span className="text-red-600">*</span><input required type="password" minLength={6} value={personnelForm.password} onChange={(event) => setPersonnelForm({ ...personnelForm, password: event.target.value })} className={`${d.form.input} mt-1`} autoComplete="new-password" /><span className="mt-1 block text-xs font-normal text-slate-500">Use at least 6 characters and share it securely with the rescuer.</span></label>
                </div>
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end"><button type="button" onClick={closeModal} disabled={saving} className={d.btn.secondary}>Cancel</button><button type="submit" disabled={saving} className={d.btn.primary}>{saving ? 'Creating Account...' : 'Create Personnel Account'}</button></div>
            </form>
          </div>
        ) : null}
      </div>
    </BarangayShell>
  );
}
