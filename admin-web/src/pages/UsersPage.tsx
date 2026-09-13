import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../services/apiClient';
import AdminShell from '../components/AdminShell';
import { d } from '../adminDesign';
import type { UserAccount } from '../types';

type Props = {
  onLogout: () => void;
  onOpenDashboard: () => void;
  onOpenAdmin: () => void;
  onOpenUsers: () => void;
  onOpenBarangay: () => void;
  onOpenMonitoring: () => void;
  onOpenFloodMonitoring: () => void;
  onOpenEvacuationAreas: () => void;
  onOpenPostUpdates: () => void;
  onAuthError: () => void;
};

type UserForm = {
  id: number | null;
  userId: string;
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  address: string;
  contactNumber: string;
};

const EMPTY_FORM: UserForm = {
  id: null,
  userId: '',
  username: '',
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  address: '',
  contactNumber: '',
};

function toForm(user: UserAccount): UserForm {
  return {
    id: user.id,
    userId: user.user_id || '',
    username: user.username || '',
    email: user.email || '',
    password: '',
    firstName: user.first_name || '',
    lastName: user.last_name || '',
    address: user.address || '',
    contactNumber: user.contact_number || '',
  };
}

export default function UsersPage({ onLogout, onOpenDashboard, onOpenAdmin, onOpenUsers, onOpenBarangay, onOpenMonitoring, onOpenFloodMonitoring, onOpenEvacuationAreas, onOpenPostUpdates, onAuthError }: Props) {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [archivedUsers, setArchivedUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [searchTerm, setSearchTerm] = useState('');

  const isEdit = form.id !== null;

  async function loadUsers() {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get('/admins/users');
      setUsers(Array.isArray(response.data) ? response.data : []);
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      setError(apiError.response?.data?.message || 'Failed to load user accounts.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadArchivedUsers() {
    setArchiveBusy(true);
    try {
      const response = await api.get('/admins/users/archived');
      setArchivedUsers(Array.isArray(response.data) ? response.data : []);
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      setError(apiError.response?.data?.message || 'Failed to load archived user accounts.');
    } finally {
      setArchiveBusy(false);
    }
  }

  function openArchiveModal() {
    setIsArchiveOpen(true);
    loadArchivedUsers().catch(() => {});
  }

  function openAddForm() {
    setForm(EMPTY_FORM);
    setIsFormOpen(true);
  }

  function openEditForm(user: UserAccount) {
    setForm(toForm(user));
    setIsFormOpen(true);
  }

  async function onSubmitForm(event: FormEvent) {
    event.preventDefault();

    setSaving(true);
    setError(null);

    try {
      const payload = {
        username: form.username,
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        address: form.address,
        contactNumber: form.contactNumber,
      };

      if (isEdit && form.id !== null) {
        await api.put(`/admins/users/${form.id}`, payload);
      } else {
        await api.post('/admins/users', payload);
      }

      setIsFormOpen(false);
      setForm(EMPTY_FORM);
      await loadUsers();
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      setError(apiError.response?.data?.message || 'Failed to save user account.');
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteUser(user: UserAccount) {
    const confirmed = window.confirm(`Archive user ${user.username}?`);
    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await api.delete(`/admins/users/${user.id}`);
      await loadUsers();
      if (isArchiveOpen) {
        await loadArchivedUsers();
      }
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      setError(apiError.response?.data?.message || 'Failed to archive user account.');
    } finally {
      setSaving(false);
    }
  }

  async function onRestoreUser(user: UserAccount) {
    setArchiveBusy(true);
    setError(null);
    try {
      await api.patch(`/admins/users/${user.id}/restore`);
      await Promise.all([loadUsers(), loadArchivedUsers()]);
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      setError(apiError.response?.data?.message || 'Failed to restore user account.');
    } finally {
      setArchiveBusy(false);
    }
  }

  async function onPermanentlyDeleteUser(user: UserAccount) {
    const confirmed = window.confirm(`Permanently delete archived user ${user.username}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setArchiveBusy(true);
    setError(null);
    try {
      await api.delete(`/admins/users/${user.id}/permanent`);
      await loadArchivedUsers();
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      setError(apiError.response?.data?.message || 'Failed to permanently delete user account.');
    } finally {
      setArchiveBusy(false);
    }
  }

  const rows = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) {
      return users;
    }

    return users.filter((user) => {
      const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim().toLowerCase();
      return (
        fullName.includes(needle) ||
        String(user.user_id || '').toLowerCase().includes(needle) ||
        String(user.username || '').toLowerCase().includes(needle) ||
        String(user.email || '').toLowerCase().includes(needle) ||
        String(user.contact_number || '').toLowerCase().includes(needle)
      );
    });
  }, [users, searchTerm]);

  return (
    <AdminShell
      activeView="users"
      title="User Account Management"
      noMainScroll
      onLogout={onLogout}
      onOpenDashboard={onOpenDashboard}
      onOpenAdmin={onOpenAdmin}
      onOpenUsers={onOpenUsers}
        onOpenBarangay={onOpenBarangay}
      onOpenMonitoring={onOpenMonitoring}
      onOpenFloodMonitoring={onOpenFloodMonitoring}
      onOpenEvacuationAreas={onOpenEvacuationAreas}
      onOpenPostUpdates={onOpenPostUpdates}
      actions={<button onClick={openAddForm} className={d.admin.actionAdd}>Add User</button>}
    >
      <div className={d.admin.root}>
        <div className={d.admin.headerRow}>
          <h2 className={d.admin.title}>User Accounts</h2>
          <div className={d.admin.searchRow}>
            <button type="button" onClick={openArchiveModal} className={d.admin.archiveButton}>
              <img
                src="https://cdn-icons-png.flaticon.com/512/3143/3143462.png"
                alt="Archive"
                className={d.admin.archiveIcon}
              />
              Archive
            </button>
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, email, username, or contact"
              className={d.admin.search}
            />
          </div>
        </div>

        {error ? <div className={d.page.error}>{error}</div> : null}

        {isFormOpen ? (
          <form onSubmit={onSubmitForm} className={d.admin.form}>
            <div className={d.admin.idBox}>
              ID: {isEdit ? form.userId || form.id : 'Auto-generated after create'}
            </div>
            <input value={form.username} onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))} placeholder="Username" className={d.form.inputSm} required />
            <input value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="Email" className={d.form.inputSm} required />
            <input value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} placeholder={isEdit ? 'Password (optional)' : 'Password'} className={d.form.inputSm} required={!isEdit} />
            <input value={form.firstName} onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))} placeholder="First Name" className={d.form.inputSm} />
            <input value={form.lastName} onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))} placeholder="Last Name" className={d.form.inputSm} />
            <input value={form.contactNumber} onChange={(e) => setForm((prev) => ({ ...prev, contactNumber: e.target.value }))} placeholder="Contact" className={d.form.inputSm} />
            <input value={form.address} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} placeholder="Address" className={d.form.inputSm} />
            <div className={d.admin.formActions}>
              <button disabled={saving} className={d.btn.emerald}>{isEdit ? 'Save Changes' : 'Create User'}</button>
              <button type="button" onClick={() => setIsFormOpen(false)} className={d.btn.secondary}>Cancel</button>
            </div>
          </form>
        ) : null}

        <div className={d.table.wrap}>
          <table className={d.table.main}>
            <thead className={d.admin.tableHead}>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th className={d.admin.thHiddenMd}>Email</th>
                <th className={d.admin.thHiddenLg}>Username</th>
                <th className={d.admin.thHiddenLg}>Contact</th>
                <th className={d.admin.thHiddenXl}>Address</th>
                <th>Actions</th>
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
                  <td>
                    <div className={d.admin.actions}>
                      <button onClick={() => openEditForm(user)} className={d.btn.secondaryXs}>Edit</button>
                      <button onClick={() => onDeleteUser(user)} className={d.btn.dangerXs}>Archive</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className={d.table.empty}>No user accounts found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {loading ? <p className={d.page.loading}>Loading users...</p> : null}

        {isArchiveOpen ? (
          <div className={d.modal.overlay}>
            <div className={d.admin.archiveModalCard}>
              <div className={d.modal.header}>
                <h4 className={d.modal.title}>Archived User Accounts</h4>
                <button onClick={() => setIsArchiveOpen(false)} className={d.modal.close}>Close</button>
              </div>
              <div className={d.admin.archiveModalBody}>
                {archiveBusy ? <p className={d.page.loading}>Loading archive...</p> : null}
                {!archiveBusy && archivedUsers.length === 0 ? <p className={d.admin.archiveEmpty}>No archived user accounts.</p> : null}
                {!archiveBusy && archivedUsers.length > 0 ? (
                  <div className={d.admin.archiveList}>
                    {archivedUsers.map((user) => (
                      <article key={user.id} className={d.admin.archiveItem}>
                        <div>
                          <p className={d.admin.archiveName}>{`${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username}</p>
                          <p className={d.admin.archiveMeta}>{user.email || 'N/A'} | Archived: {user.archived_at ? new Date(user.archived_at).toLocaleString() : 'N/A'}</p>
                        </div>
                        <div className={d.admin.archiveActions}>
                          <button type="button" onClick={() => onRestoreUser(user)} className={[d.btn.secondaryXs, d.admin.archiveActionButton].join(' ')} disabled={archiveBusy}>Restore</button>
                          <button type="button" onClick={() => onPermanentlyDeleteUser(user)} className={[d.btn.dangerXs, d.admin.archiveActionButton].join(' ')} disabled={archiveBusy}>Permanent Delete</button>
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
