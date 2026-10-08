import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../services/apiClient';
import AdminShell from '../components/AdminShell';
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
  onAuthError: () => void;
};

type VerificationDetail = UserAccount & {
  valid_id_image: string | null;
  verification_reviewed_at?: string | null;
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

function UserPlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6" />
    </svg>
  );
}

export default function UsersPage(props: Props) {
  const { onAuthError } = props;
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [archivedUsers, setArchivedUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [selectedUser, setSelectedUser] = useState<VerificationDetail | null>(null);
  const [isNewUsersOpen, setIsNewUsersOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [isSaveConfirmOpen, setIsSaveConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const handleApiError = useCallback((error: unknown, fallback: string, target: 'page' | 'review' = 'page') => {
    const apiError = error as { response?: { status?: number; data?: { message?: string } } };
    if (apiError.response?.status === 401) {
      onAuthError();
      return;
    }
    const message = apiError.response?.data?.message || fallback;
    if (target === 'review') setReviewError(message);
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
    const interval = window.setInterval(() => {
      loadUsers(false).catch(() => {});
    }, 30000);
    return () => window.clearInterval(interval);
  }, [loadUsers]);

  const pendingUsers = useMemo(
    () => users.filter((user) => user.verification_status === 'pending'),
    [users],
  );

  const reviewUsers = useMemo(
    () => users.filter((user) => user.verification_status !== 'approved'),
    [users],
  );

  const rows = useMemo(() => {
    const verifiedUsers = users.filter((user) => user.verification_status === 'approved');
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return verifiedUsers;
    return verifiedUsers.filter((user) => [
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

  async function openUser(user: UserAccount) {
    setReviewLoading(true);
    setReviewError(null);
    setIsEditing(false);
    setEditForm(null);
    setSelectedUser({ ...user, valid_id_image: null });
    try {
      const response = await api.get(`/admins/users/${user.id}/verification`);
      setSelectedUser(response.data as VerificationDetail);
    } catch (requestError) {
      handleApiError(requestError, 'Failed to load the submitted valid ID.', 'review');
    } finally {
      setReviewLoading(false);
    }
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
    setReviewError(null);
  }

  function startEditing() {
    if (!selectedUser) return;
    setEditForm(userToEditForm(selectedUser));
    setIsEditing(true);
    setReviewError(null);
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
    setReviewSaving(true);
    setReviewError(null);
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
      handleApiError(requestError, 'Failed to save account changes.', 'review');
    } finally {
      setReviewSaving(false);
    }
  }

  async function review(status: 'approved' | 'disapproved') {
    if (!selectedUser) return;
    setReviewSaving(true);
    setReviewError(null);
    try {
      const response = await api.patch(`/admins/users/${selectedUser.id}/verification`, { status });
      setSelectedUser((current) => current ? {
        ...current,
        verification_status: response.data?.verification_status || status,
        verification_reviewed_at: response.data?.verification_reviewed_at || new Date().toISOString(),
      } : current);
      await loadUsers();
    } catch (requestError) {
      handleApiError(requestError, `Failed to ${status === 'approved' ? 'approve' : 'disapprove'} the account.`, 'review');
    } finally {
      setReviewSaving(false);
    }
  }

  async function archiveUser(user: UserAccount) {
    if (!window.confirm(`Archive user ${user.username}?`)) return;
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
    if (!window.confirm(`Permanently delete archived user ${user.username}? This cannot be undone.`)) return;
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

  const status = selectedUser?.verification_status || 'pending';

  return (
    <AdminShell
      activeView="users"
      title="User Account Management"
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
      actions={(
        <button
          type="button"
          onClick={() => setIsNewUsersOpen(true)}
          className="relative flex h-12 w-12 items-center justify-center rounded-xl border-2 border-[#1f4e79] bg-[#1f4e79] text-white shadow-sm transition hover:bg-[#173b5c]"
          aria-label={`New users awaiting verification: ${pendingUsers.length}`}
          title="User verification requests"
        >
          <UserPlusIcon />
          {pendingUsers.length > 0 ? <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-red-600" aria-hidden="true" /> : null}
        </button>
      )}
    >
      <div className={d.admin.root}>
        <div className={d.admin.headerRow}>
          <h2 className={d.admin.title}>User Accounts</h2>
          <div className={d.admin.searchRow}>
            <button type="button" onClick={() => { setIsArchiveOpen(true); loadArchivedUsers().catch(() => {}); }} className={d.admin.archiveButton}>
              <img src={ARCHIVE_ICON} alt="Archive" className={d.admin.archiveIcon} />
              Archive
            </button>
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search User Account" className={d.admin.search} />
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
              {!loading && rows.length === 0 ? <tr><td colSpan={7} className={d.table.empty}>No verified user accounts found.</td></tr> : null}
            </tbody>
          </table>
        </div>
        {loading ? <p className={d.page.loading}>Loading users...</p> : null}

        {isNewUsersOpen ? (
          <div className={d.modal.overlay} role="dialog" aria-modal="true" aria-label="User verification requests">
            <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <div><h3 className="text-lg font-black text-[#1a3650]">User Verification Requests</h3><p className="text-xs text-slate-500">Select an account to review its valid ID.</p></div>
                <button type="button" onClick={() => setIsNewUsersOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-xl font-bold text-slate-600 hover:bg-slate-100" aria-label="Close">X</button>
              </div>
              <div className="max-h-[70dvh] space-y-2 overflow-y-auto p-5">
                {reviewUsers.length === 0 ? <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">No accounts are waiting for verification.</p> : null}
                {reviewUsers.map((user) => (
                  <button key={user.id} type="button" onClick={() => { setIsNewUsersOpen(false); openUser(user); }} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left hover:border-sky-300 hover:bg-sky-50">
                    <div className="min-w-0"><p className="truncate font-extrabold text-[#1a3650]">{`${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username}</p><p className="truncate text-xs text-slate-500">{user.email} · {user.user_id || `USR-${user.id}`}</p></div>
                    <span className={user.verification_status === 'disapproved' ? 'rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800' : 'rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700'}>
                      {user.verification_status === 'disapproved' ? 'Disapproved' : 'Review'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

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
                <div><h3 className="text-lg font-black text-[#1a3650]">{status === 'approved' ? 'User Account' : 'Account Verification'}</h3><p className="text-xs text-slate-500">{selectedUser.user_id || `USR-${selectedUser.id}`}</p></div>
                <div className="flex items-center gap-2">
                  {status === 'approved' && !isEditing ? <button type="button" onClick={startEditing} className={d.btn.secondary}>Edit Account</button> : null}
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
                    <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => { setIsEditing(false); setEditForm(null); }} className={d.btn.secondary}>Cancel</button><button type="button" onClick={requestSaveChanges} className={d.btn.primary} disabled={reviewSaving}>Save Changes</button></div>
                  </div>
                ) : (
                  <div className="mb-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-2">
                    <p><span className="font-bold text-slate-600">Name:</span> {`${selectedUser.first_name || ''} ${selectedUser.last_name || ''}`.trim() || 'N/A'}</p><p><span className="font-bold text-slate-600">Status:</span> <span className="capitalize">{status}</span></p>
                    <p><span className="font-bold text-slate-600">Email:</span> {selectedUser.email || 'N/A'}</p><p><span className="font-bold text-slate-600">Username:</span> {selectedUser.username || 'N/A'}</p>
                    <p><span className="font-bold text-slate-600">Contact:</span> {selectedUser.contact_number || 'N/A'}</p><p><span className="font-bold text-slate-600">Address:</span> {selectedUser.address || 'N/A'}</p>
                  </div>
                )}

                <h4 className="mb-2 mt-4 text-sm font-extrabold text-[#1a3650]">Uploaded Valid ID</h4>
                {reviewLoading ? <p className={d.page.loading}>Loading valid ID...</p> : null}
                {!reviewLoading && selectedUser.valid_id_image ? <img src={selectedUser.valid_id_image} alt="User submitted valid ID" className="max-h-[38dvh] w-full rounded-xl border border-slate-300 bg-slate-100 object-contain" /> : null}
                {!reviewLoading && !selectedUser.valid_id_image ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">No valid ID image was submitted for this account.</p> : null}
                {reviewError ? <div className={`${d.page.error} mt-3`}>{reviewError}</div> : null}

                {status === 'pending' ? <div className="mt-5 grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => review('approved')} disabled={reviewSaving || reviewLoading} className="rounded-lg bg-emerald-600 px-4 py-3 text-sm font-extrabold text-white hover:bg-emerald-700 disabled:opacity-50">Approve</button><button type="button" onClick={() => review('disapproved')} disabled={reviewSaving || reviewLoading} className="rounded-lg bg-red-600 px-4 py-3 text-sm font-extrabold text-white hover:bg-red-700 disabled:opacity-50">Disapprove</button></div> : null}
              </div>
            </div>
          </div>
        ) : null}

        {isSaveConfirmOpen ? (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-4" role="alertdialog" aria-modal="true" aria-label="Save account changes">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><h3 className="text-lg font-black text-[#1a3650]">Save changes?</h3><p className="mt-2 text-sm text-slate-600">The account information was changed. Do you want to save these changes?</p><div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={() => setIsSaveConfirmOpen(false)} className={d.btn.secondary} disabled={reviewSaving}>Cancel</button><button type="button" onClick={saveChanges} className={d.btn.primary} disabled={reviewSaving}>{reviewSaving ? 'Saving...' : 'Save Changes'}</button></div></div>
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
