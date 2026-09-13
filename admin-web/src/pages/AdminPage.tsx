import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../services/apiClient';
import AdminShell from '../components/AdminShell';
import { d } from '../adminDesign';
import type { AdminAccount } from '../types';

// Decode the JWT payload without verifying signature (safe for UI-only use)
function decodeJwtUserId(): number | null {
  try {
    const token =
      localStorage.getItem('admin_token') || sessionStorage.getItem('admin_token');
    if (!token) return null;
    const base64Payload = token.split('.')[1];
    const json = atob(base64Payload.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json);
    return typeof payload?.userId === 'number' ? payload.userId : null;
  } catch {
    return null;
  }
}

function formatLastLogin(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return d.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

type Props = {
  onLogout: () => void;
  onOpenDashboard: () => void;
  onOpenUsers: () => void;
  onOpenBarangay: () => void;
  onOpenMonitoring: () => void;
  onOpenFloodMonitoring: () => void;
  onOpenEvacuationAreas: () => void;
  onOpenPostUpdates: () => void;
  onAuthError: () => void;
};

type AdminForm = {
  id: number | null;
  adminId: string;
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  address: string;
  contactNumber: string;
};

const EMPTY_FORM: AdminForm = {
  id: null,
  adminId: '',
  username: '',
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  address: '',
  contactNumber: '',
};

function toForm(admin: AdminAccount): AdminForm {
  return {
    id: admin.id,
    adminId: admin.admin_id || '',
    username: admin.username || '',
    email: admin.email || '',
    password: '',
    firstName: admin.first_name || '',
    lastName: admin.last_name || '',
    address: admin.address || '',
    contactNumber: admin.contact_number || '',
  };
}

export default function AdminPage({ onLogout, onOpenDashboard, onOpenUsers, onOpenBarangay, onOpenMonitoring, onOpenFloodMonitoring, onOpenEvacuationAreas, onOpenPostUpdates, onAuthError }: Props) {
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [archivedAdmins, setArchivedAdmins] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId] = useState<number | null>(() => decodeJwtUserId());

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [form, setForm] = useState<AdminForm>(EMPTY_FORM);
  const [searchTerm, setSearchTerm] = useState('');

  const isEdit = form.id !== null;

  async function loadAdmins() {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get('/admins');
      setAdmins(Array.isArray(response.data) ? response.data : []);
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      setError(apiError.response?.data?.message || 'Failed to load admin accounts.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAdmins();
  }, []);

  async function loadArchivedAdmins() {
    setArchiveBusy(true);
    try {
      const response = await api.get('/admins/archived');
      setArchivedAdmins(Array.isArray(response.data) ? response.data : []);
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      setError(apiError.response?.data?.message || 'Failed to load archived admin accounts.');
    } finally {
      setArchiveBusy(false);
    }
  }

  function openArchiveModal() {
    setIsArchiveOpen(true);
    loadArchivedAdmins().catch(() => {});
  }

  function openAddForm() {
    setForm(EMPTY_FORM);
    setIsFormOpen(true);
  }

  function openEditForm(admin: AdminAccount) {
    setForm(toForm(admin));
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
        await api.put(`/admins/${form.id}`, payload);
      } else {
        await api.post('/admins', payload);
      }

      setIsFormOpen(false);
      setForm(EMPTY_FORM);
      await loadAdmins();
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      setError(apiError.response?.data?.message || 'Failed to save admin account.');
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteAdmin(admin: AdminAccount) {
    const confirmed = window.confirm(`Archive admin ${admin.username}?`);
    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await api.delete(`/admins/${admin.id}`);
      await loadAdmins();
      if (isArchiveOpen) {
        await loadArchivedAdmins();
      }
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      setError(apiError.response?.data?.message || 'Failed to archive admin account.');
    } finally {
      setSaving(false);
    }
  }

  async function onRestoreAdmin(admin: AdminAccount) {
    setArchiveBusy(true);
    setError(null);
    try {
      await api.patch(`/admins/${admin.id}/restore`);
      await Promise.all([loadAdmins(), loadArchivedAdmins()]);
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      setError(apiError.response?.data?.message || 'Failed to restore admin account.');
    } finally {
      setArchiveBusy(false);
    }
  }

  async function onPermanentlyDeleteAdmin(admin: AdminAccount) {
    const confirmed = window.confirm(`Permanently delete archived admin ${admin.username}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setArchiveBusy(true);
    setError(null);
    try {
      await api.delete(`/admins/${admin.id}/permanent`);
      await loadArchivedAdmins();
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      setError(apiError.response?.data?.message || 'Failed to permanently delete admin account.');
    } finally {
      setArchiveBusy(false);
    }
  }

  const rows = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) {
      return admins;
    }

    return admins.filter((admin) => {
      const fullName = `${admin.first_name || ''} ${admin.last_name || ''}`.trim().toLowerCase();
      return (
        fullName.includes(needle) ||
        String(admin.admin_id || '').toLowerCase().includes(needle) ||
        String(admin.username || '').toLowerCase().includes(needle) ||
        String(admin.email || '').toLowerCase().includes(needle) ||
        String(admin.contact_number || '').toLowerCase().includes(needle)
      );
    });
  }, [admins, searchTerm]);

  return (
    <AdminShell
      activeView="admin"
      title="Admin Account Management"
      noMainScroll
      onLogout={onLogout}
      onOpenDashboard={onOpenDashboard}
      onOpenAdmin={() => {}}
      onOpenUsers={onOpenUsers}
        onOpenBarangay={onOpenBarangay}
      onOpenMonitoring={onOpenMonitoring}
      onOpenFloodMonitoring={onOpenFloodMonitoring}
      onOpenEvacuationAreas={onOpenEvacuationAreas}
      onOpenPostUpdates={onOpenPostUpdates}
      actions={<button onClick={openAddForm} className={d.admin.actionAdd}>Add Admin</button>}
    >
      <div className={d.admin.root}>
            <div className={d.admin.headerRow}>
              <h2 className={d.admin.title}>Admin Accounts</h2>
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
                  ID: {isEdit ? form.adminId || form.id : 'Auto-generated after create'}
                </div>
                <input value={form.username} onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))} placeholder="Username" className={d.form.inputSm} required />
                <input value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="Email" className={d.form.inputSm} required />
                <input value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} placeholder={isEdit ? 'Password (optional)' : 'Password'} className={d.form.inputSm} required={!isEdit} />
                <input value={form.firstName} onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))} placeholder="First Name" className={d.form.inputSm} />
                <input value={form.lastName} onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))} placeholder="Last Name" className={d.form.inputSm} />
                <input value={form.contactNumber} onChange={(e) => setForm((prev) => ({ ...prev, contactNumber: e.target.value }))} placeholder="Contact" className={d.form.inputSm} />
                <input value={form.address} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} placeholder="Address" className={d.form.inputSm} />
                <div className={d.admin.formActions}>
                  <button disabled={saving} className={d.btn.emerald}>
                    {isEdit ? 'Save Changes' : 'Create Admin'}
                  </button>
                  <button type="button" onClick={() => setIsFormOpen(false)} className={d.btn.secondary}>
                    Cancel
                  </button>
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
                    <th className={d.admin.thHiddenMd}>Status</th>
                    <th className={d.admin.thHiddenXl}>Last Login</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((admin) => {
                    const isOwner = currentUserId === admin.id;
                    return (
                    <tr key={admin.id} className={d.admin.row}>
                      <td>
                        <span>{admin.admin_id || `ADM-${String(admin.id).padStart(5, '0')}`}</span>
                        {isOwner && (
                          <span className="ml-1 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded px-1 py-0.5 align-middle">You</span>
                        )}
                      </td>
                      <td className={d.admin.truncate}>{`${admin.first_name || ''} ${admin.last_name || ''}`.trim() || 'N/A'}</td>
                      <td className={d.admin.tdHiddenTruncateMd}>{admin.email || 'N/A'}</td>
                      <td className={d.admin.tdHiddenLg}>{admin.username || 'N/A'}</td>
                      <td className={d.admin.tdHiddenLg}>{admin.contact_number || 'N/A'}</td>
                      <td className={d.admin.thHiddenMd}>
                        {admin.is_active
                          ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>Active</span>
                          : <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5"><span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block"></span>Inactive</span>
                        }
                      </td>
                      <td className={d.admin.tdHiddenTruncateXl + ' text-xs text-slate-500'}>{formatLastLogin(admin.last_login)}</td>
                      <td>
                        <div className={d.admin.actions}>
                          {isOwner ? (
                            <>
                              <button onClick={() => openEditForm(admin)} className={d.btn.secondaryXs}>
                                Edit
                              </button>
                              <button onClick={() => onDeleteAdmin(admin)} className={d.btn.dangerXs}>
                                Archive
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400 italic">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                  {!loading && rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className={d.table.empty}>No admin accounts found.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {loading ? <p className={d.page.loading}>Loading admins...</p> : null}

            {isArchiveOpen ? (
              <div className={d.modal.overlay}>
                <div className={d.admin.archiveModalCard}>
                  <div className={d.modal.header}>
                    <h4 className={d.modal.title}>Archived Admin Accounts</h4>
                    <button onClick={() => setIsArchiveOpen(false)} className={d.modal.close}>Close</button>
                  </div>
                  <div className={d.admin.archiveModalBody}>
                    {archiveBusy ? <p className={d.page.loading}>Loading archive...</p> : null}
                    {!archiveBusy && archivedAdmins.length === 0 ? <p className={d.admin.archiveEmpty}>No archived admin accounts.</p> : null}
                    {!archiveBusy && archivedAdmins.length > 0 ? (
                      <div className={d.admin.archiveList}>
                        {archivedAdmins.map((admin) => (
                          <article key={admin.id} className={d.admin.archiveItem}>
                            <div>
                              <p className={d.admin.archiveName}>{`${admin.first_name || ''} ${admin.last_name || ''}`.trim() || admin.username}</p>
                              <p className={d.admin.archiveMeta}>{admin.email || 'N/A'} | Archived: {admin.archived_at ? new Date(admin.archived_at).toLocaleString() : 'N/A'}</p>
                            </div>
                            <div className={d.admin.archiveActions}>
                              <button type="button" onClick={() => onRestoreAdmin(admin)} className={[d.btn.secondaryXs, d.admin.archiveActionButton].join(' ')} disabled={archiveBusy}>Restore</button>
                              <button type="button" onClick={() => onPermanentlyDeleteAdmin(admin)} className={[d.btn.dangerXs, d.admin.archiveActionButton].join(' ')} disabled={archiveBusy}>Permanent Delete</button>
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
