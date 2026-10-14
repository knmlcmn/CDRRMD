import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../services/apiClient';
import AdminShell from '../components/AdminShell';
import AddAccountDialog, { type AccountRole } from '../components/AddAccountDialog';
import { useConfirmationDialog } from '../components/ConfirmationDialog';
import { d } from '../adminDesign';
import type { UserAccount } from '../types';

const ARCHIVE_ICON = 'https://cdn-icons-png.flaticon.com/512/3143/3143462.png';

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
  onOpenHistory: () => void;
  onAuthError: () => void;
};

type EditForm = {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  contactNumber: string;
  address: string;
};

function userToEditForm(user: UserAccount): EditForm {
  return {
    username: user.username || '',
    email: user.email || '',
    password: '',
    firstName: user.first_name || '',
    lastName: user.last_name || '',
    contactNumber: user.contact_number || '',
    address: user.address || '',
  };
}

export default function UsersPage(props: Props) {
  const { onAuthError } = props;
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [archivedUsers, setArchivedUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveBusy, setSaveBusy] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [isSaveConfirmOpen, setIsSaveConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { confirm, confirmationDialog } = useConfirmationDialog();

  const handleApiError = useCallback((error: unknown, fallback: string, target: 'page' | 'modal' = 'page') => {
    const apiError = error as { response?: { status?: number; data?: { message?: string } } };
    if (apiError.response?.status === 401) {
      onAuthError();
      return;
    }
    const message = apiError.response?.data?.message || fallback;
    if (target === 'modal') setModalError(message);
    else setError(message);
  }, [onAuthError]);

  const loadUsers = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const response = await api.get('/admins/users');
      setUsers(Array.isArray(response.data) ? response.data : []);
    } catch (requestError) {
      handleApiError(requestError, 'Failed to load user accounts.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [handleApiError]);

  useEffect(() => {
    loadUsers().catch(() => {});
  }, [loadUsers]);

  const rows = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((user) => [
      user.user_id,
      `${user.first_name || ''} ${user.last_name || ''}`,
      user.email,
      user.username,
      user.contact_number,
      user.address,
    ].some((value) => String(value || '').toLowerCase().includes(needle)));
  }, [users, searchTerm]);

  async function loadArchivedUsers() {
    setArchiveBusy(true);
    setError(null);
    try {
      const response = await api.get('/admins/users/archived');
      setArchivedUsers(Array.isArray(response.data) ? response.data : []);
    } catch (requestError) {
      handleApiError(requestError, 'Failed to load archived user accounts.');
    } finally {
      setArchiveBusy(false);
    }
  }

  function openUser(user: UserAccount) {
    setModalError(null);
    setIsEditing(false);
    setEditForm(null);
    setSelectedUser(user);
  }

  function closeUser() {
    if (isEditing && hasEditChanges()) {
      setIsSaveConfirmOpen(true);
      return;
    }
    setSelectedUser(null);
    setIsEditing(false);
    setEditForm(null);
    setIsSaveConfirmOpen(false);
    setModalError(null);
  }

  function startEditing() {
    if (!selectedUser) return;
    setEditForm(userToEditForm(selectedUser));
    setIsEditing(true);
    setModalError(null);
  }

  function editField<K extends keyof EditForm>(field: K, value: EditForm[K]) {
    setEditForm((current) => current ? { ...current, [field]: value } : current);
  }

  function hasEditChanges() {
    if (!selectedUser || !editForm) return false;
    const original = userToEditForm(selectedUser);
    return (Object.keys(original) as Array<keyof EditForm>).some((key) => editForm[key] !== original[key]);
  }

  function requestSaveChanges() {
    if (!hasEditChanges()) {
      setIsEditing(false);
      setEditForm(null);
      return;
    }
    setIsSaveConfirmOpen(true);
  }

  async function saveChanges() {
    if (!selectedUser || !editForm) return;
    setSaveBusy(true);
    setModalError(null);
    try {
      const response = await api.put(`/admins/users/${selectedUser.id}`, editForm);
      const updated = response.data as UserAccount;
      setSelectedUser((current) => current ? { ...current, ...updated } : current);
      setIsSaveConfirmOpen(false);
      setIsEditing(false);
      setEditForm(null);
      await loadUsers();
    } catch (requestError) {
      setIsSaveConfirmOpen(false);
      handleApiError(requestError, 'Failed to save account changes.', 'modal');
    } finally {
      setSaveBusy(false);
    }
  }

  async function archiveUser(user: UserAccount) {
    const confirmed = await confirm({
      title: 'Archive account?',
      message: `Archive the user account “${user.username}”? You can restore it later.`,
      confirmLabel: 'Archive',
      tone: 'danger',
    });
    if (!confirmed) return;
    setArchiveBusy(true);
    setError(null);
    try {
      await api.delete(`/admins/users/${user.id}`);
      if (selectedUser?.id === user.id) closeUser();
      await loadUsers();
      if (isArchiveOpen) await loadArchivedUsers();
    } catch (requestError) {
      handleApiError(requestError, 'Failed to archive user account.');
    } finally {
      setArchiveBusy(false);
    }
  }

  async function restoreUser(user: UserAccount) {
    const confirmed = await confirm({
      title: 'Restore account?',
      message: `Restore the user account “${user.username}”? The user will be able to access the system again.`,
      confirmLabel: 'Restore',
    });
    if (!confirmed) return;
    setArchiveBusy(true);
    setError(null);
    try {
      await api.patch(`/admins/users/${user.id}/restore`);
      await Promise.all([loadUsers(), loadArchivedUsers()]);
    } catch (requestError) {
      handleApiError(requestError, 'Failed to restore user account.');
    } finally {
      setArchiveBusy(false);
    }
  }

  async function permanentlyDeleteUser(user: UserAccount) {
    const confirmed = await confirm({
      title: 'Permanently delete account?',
      message: `Permanently delete the archived user account “${user.username}”? This cannot be undone.`,
      confirmLabel: 'Delete Permanently',
      tone: 'danger',
    });
    if (!confirmed) return;
    setArchiveBusy(true);
    setError(null);
    try {
      await api.delete(`/admins/users/${user.id}/permanent`);
      await loadArchivedUsers();
    } catch (requestError) {
      handleApiError(requestError, 'Failed to permanently delete user account.');
    } finally {
      setArchiveBusy(false);
    }
  }

  async function handleCreated(role: AccountRole) {
    if (role === 'user') return loadUsers();
    if (role === 'admin') return props.onOpenAdmin();
    if (role === 'barangay') return props.onOpenBarangay();
    return props.onOpenRescuers();
  }

  return (
    <AdminShell
      activeView="users"
      title="Account Management"
      noMainScroll
      onLogout={props.onLogout}
      onOpenDashboard={props.onOpenDashboard}
      onOpenAdmin={props.onOpenAdmin}
      onOpenUsers={props.onOpenUsers}
      onOpenBarangay={props.onOpenBarangay}
      onOpenRescuers={props.onOpenRescuers}
      onOpenMonitoring={props.onOpenMonitoring}
      onOpenFloodMonitoring={props.onOpenFloodMonitoring}
      onOpenEvacuationAreas={props.onOpenEvacuationAreas}
      onOpenPostUpdates={props.onOpenPostUpdates}
      onOpenHistory={props.onOpenHistory}
    >
      <div className={d.admin.root}>
        <div className={d.admin.headerRow}>
          <h2 className={d.admin.title}>User Accounts</h2>
          <div className={d.admin.searchRow}>
            <button type="button" onClick={() => loadUsers(false).catch(() => {})} className={d.admin.archiveButton} disabled={loading}>Refresh</button>
            <button type="button" onClick={() => { setIsArchiveOpen(true); loadArchivedUsers().catch(() => {}); }} className={d.admin.archiveButton}>
              <img src={ARCHIVE_ICON} alt="Archive" className={d.admin.archiveIcon} />
              Archive
            </button>
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search User Account" className={d.admin.search} />
            <AddAccountDialog initialRole="user" onCreated={handleCreated} onAuthError={onAuthError} />
          </div>
        </div>

        {error ? <div className={d.page.error}>{error}</div> : null}

        <div className={d.table.wrap}>
          <table className={d.table.main}>
            <thead className={d.admin.tableHead}>
              <tr>
                <th>ID</th><th>Name</th><th className={d.admin.thHiddenMd}>Email</th><th className={d.admin.thHiddenLg}>Username</th><th className={d.admin.thHiddenLg}>Contact</th><th className={d.admin.thHiddenXl}>Address</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((user) => (
                <tr key={user.id} className={d.admin.row}>
                  <td>{user.user_id || `USR-${String(user.id).padStart(5, '0')}`}</td>
                  <td className={d.admin.truncate}>{`${user.first_name || ''} ${user.last_name || ''}`.trim() || 'N/A'}</td>
                  <td className={d.admin.tdHiddenTruncateMd}>{user.email || 'N/A'}</td>
                  <td className={d.admin.tdHiddenLg}>{user.username || 'N/A'}</td>
                  <td className={d.admin.tdHiddenLg}>{user.contact_number || 'N/A'}</td>
                  <td className={d.admin.tdHiddenTruncateXl}>{user.address || 'N/A'}</td>
                  <td><div className={d.admin.actions}><button type="button" onClick={() => openUser(user)} className={d.btn.secondaryXs}>View</button><button type="button" onClick={() => archiveUser(user)} className={d.btn.dangerXs} disabled={archiveBusy}>Archive</button></div></td>
                </tr>
              ))}
              {!loading && rows.length === 0 ? <tr><td colSpan={7} className={d.table.empty}>No user accounts found.</td></tr> : null}
            </tbody>
          </table>
        </div>
        {loading ? <p className={d.page.loading}>Loading users...</p> : null}

        {isArchiveOpen ? (
          <div className={d.modal.overlay} role="dialog" aria-modal="true" aria-label="Archived user accounts">
            <div className={d.admin.archiveModalCard}>
              <div className={d.modal.header}><h3 className={d.modal.title}>Archived User Accounts</h3><button type="button" onClick={() => setIsArchiveOpen(false)} className={d.modal.close}>Close</button></div>
              <div className={d.admin.archiveModalBody}>
                {archiveBusy ? <p className={d.page.loading}>Loading archive...</p> : null}
                {!archiveBusy && archivedUsers.length === 0 ? <p className={d.admin.archiveEmpty}>No archived user accounts.</p> : null}
                <div className={d.admin.archiveList}>
                  {archivedUsers.map((user) => (
                    <article key={user.id} className={d.admin.archiveItem}>
                      <div><p className={d.admin.archiveName}>{`${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username}</p><p className={d.admin.archiveMeta}>{user.email || 'N/A'} | Archived: {user.archived_at ? new Date(user.archived_at).toLocaleString() : 'N/A'}</p></div>
                      <div className={d.admin.archiveActions}><button type="button" onClick={() => restoreUser(user)} className={[d.btn.secondaryXs, d.admin.archiveActionButton].join(' ')} disabled={archiveBusy}>Restore</button><button type="button" onClick={() => permanentlyDeleteUser(user)} className={[d.btn.dangerXs, d.admin.archiveActionButton].join(' ')} disabled={archiveBusy}>Permanent Delete</button></div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {selectedUser ? (
          <div className={d.modal.overlay} role="dialog" aria-modal="true" aria-label="View user account">
            <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <div><h3 className="text-lg font-black text-[#1a3650]">User Account</h3><p className="text-xs text-slate-500">{selectedUser.user_id || `USR-${selectedUser.id}`}</p></div>
                <div className="flex items-center gap-2">
                  {!isEditing ? <button type="button" onClick={startEditing} className={d.btn.secondary}>Edit Account</button> : null}
                  <button type="button" onClick={closeUser} className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-lg font-bold text-slate-600 hover:bg-slate-100" aria-label="Close">X</button>
                </div>
              </div>

              <div className="max-h-[75dvh] overflow-y-auto p-5">
                {isEditing && editForm ? (
                  <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                    <input value={editForm.firstName} onChange={(event) => editField('firstName', event.target.value)} placeholder="First Name" className={d.form.input} />
                    <input value={editForm.lastName} onChange={(event) => editField('lastName', event.target.value)} placeholder="Last Name" className={d.form.input} />
                    <input value={editForm.email} onChange={(event) => editField('email', event.target.value)} placeholder="Email" type="email" className={d.form.input} />
                    <input value={editForm.username} onChange={(event) => editField('username', event.target.value)} placeholder="Username" className={d.form.input} />
                    <input value={editForm.contactNumber} onChange={(event) => editField('contactNumber', event.target.value)} placeholder="Contact" className={d.form.input} />
                    <input value={editForm.address} onChange={(event) => editField('address', event.target.value)} placeholder="Address" className={d.form.input} />
                    <input value={editForm.password} onChange={(event) => editField('password', event.target.value)} placeholder="New password (optional)" type="password" className={`${d.form.input} sm:col-span-2`} />
                    <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => { setIsEditing(false); setEditForm(null); }} className={d.btn.secondary}>Cancel</button><button type="button" onClick={requestSaveChanges} className={d.btn.primary} disabled={saveBusy}>Save Changes</button></div>
                  </div>
                ) : (
                  <div className="mb-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-2">
                    <p><span className="font-bold text-slate-600">Name:</span> {`${selectedUser.first_name || ''} ${selectedUser.last_name || ''}`.trim() || 'N/A'}</p><p><span className="font-bold text-slate-600">Created:</span> {selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleString() : 'N/A'}</p>
                    <p><span className="font-bold text-slate-600">Email:</span> {selectedUser.email || 'N/A'}</p><p><span className="font-bold text-slate-600">Username:</span> {selectedUser.username || 'N/A'}</p>
                    <p><span className="font-bold text-slate-600">Contact:</span> {selectedUser.contact_number || 'N/A'}</p><p><span className="font-bold text-slate-600">Address:</span> {selectedUser.address || 'N/A'}</p>
                  </div>
                )}

                {modalError ? <div className={`${d.page.error} mt-3`}>{modalError}</div> : null}
              </div>
            </div>
          </div>
        ) : null}

        {isSaveConfirmOpen ? (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-4" role="alertdialog" aria-modal="true" aria-label="Save account changes">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><h3 className="text-lg font-black text-[#1a3650]">Save changes?</h3><p className="mt-2 text-sm text-slate-600">The account information was changed. Do you want to save these changes?</p><div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={() => setIsSaveConfirmOpen(false)} className={d.btn.secondary} disabled={saveBusy}>Cancel</button><button type="button" onClick={saveChanges} className={d.btn.primary} disabled={saveBusy}>{saveBusy ? 'Saving...' : 'Save Changes'}</button></div></div>
          </div>
        ) : null}
        {confirmationDialog}
      </div>
    </AdminShell>
  );
}
