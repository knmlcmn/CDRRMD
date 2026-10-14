import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../services/apiClient';
import AdminShell from '../components/AdminShell';
import AddAccountDialog, { type AccountRole } from '../components/AddAccountDialog';
import AccountDetailsModal, { type AccountEditValues } from '../components/AccountDetailsModal';
import { useConfirmationDialog } from '../components/ConfirmationDialog';
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
  onOpenRescuers: () => void;
  onOpenMonitoring: () => void;
  onOpenFloodMonitoring: () => void;
  onOpenEvacuationAreas: () => void;
  onOpenPostUpdates: () => void;
  onOpenHistory: () => void;
  onAuthError: () => void;
};

function toEditValues(admin: AdminAccount): AccountEditValues {
  return {
    username: admin.username || '',
    email: admin.email || '',
    password: '',
    firstName: admin.first_name || '',
    lastName: admin.last_name || '',
    address: admin.address || '',
    contactNumber: admin.contact_number || '',
    barangayName: '',
  };
}

export default function AdminPage({ onLogout, onOpenDashboard, onOpenUsers, onOpenBarangay, onOpenRescuers, onOpenMonitoring, onOpenFloodMonitoring, onOpenEvacuationAreas, onOpenPostUpdates, onOpenHistory, onAuthError }: Props) {
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [archivedAdmins, setArchivedAdmins] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [currentUserId] = useState<number | null>(() => decodeJwtUserId());

  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<AdminAccount | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { confirm, confirmationDialog } = useConfirmationDialog();

  const loadAdmins = useCallback(async () => {
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
  }, [onAuthError]);

  useEffect(() => {
    loadAdmins();
  }, [loadAdmins]);

  async function loadArchivedAdmins() {
    setArchiveBusy(true);
    setArchiveError(null);
    try {
      const response = await api.get('/admins/archived');
      setArchivedAdmins(Array.isArray(response.data) ? response.data : []);
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      setArchiveError(apiError.response?.data?.message || 'Failed to load archived admin accounts.');
    } finally {
      setArchiveBusy(false);
    }
  }

  function openArchiveModal() {
    setArchiveError(null);
    setIsArchiveOpen(true);
    loadArchivedAdmins().catch(() => {});
  }

  async function saveAdmin(values: AccountEditValues) {
    if (!selectedAdmin) return;
    setSaving(true);
    setFormError(null);

    try {
      const payload = {
        username: values.username.trim(),
        email: values.email.trim(),
        password: values.password,
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        address: values.address.trim(),
        contactNumber: values.contactNumber.trim(),
      };

      await api.put(`/admins/${selectedAdmin.id}`, payload);

      setSelectedAdmin(null);
      await loadAdmins();
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      setFormError(apiError.response?.data?.message || 'Failed to save admin account.');
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteAdmin(admin: AdminAccount) {
    const confirmed = await confirm({
      title: 'Archive account?',
      message: `Archive the admin account “${admin.username}”? You can restore it later.`,
      confirmLabel: 'Archive',
      tone: 'danger',
    });
    if (!confirmed) return;

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
    const confirmed = await confirm({
      title: 'Restore account?',
      message: `Restore the admin account “${admin.username}”? It will be able to access the portal again.`,
      confirmLabel: 'Restore',
    });
    if (!confirmed) return;
    setArchiveBusy(true);
    setArchiveError(null);
    try {
      await api.patch(`/admins/${admin.id}/restore`);
      await Promise.all([loadAdmins(), loadArchivedAdmins()]);
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      setArchiveError(apiError.response?.data?.message || 'Failed to restore admin account.');
    } finally {
      setArchiveBusy(false);
    }
  }

  async function onPermanentlyDeleteAdmin(admin: AdminAccount) {
    const confirmed = await confirm({
      title: 'Permanently delete account?',
      message: `Permanently delete the archived admin account “${admin.username}”? This cannot be undone.`,
      confirmLabel: 'Delete Permanently',
      tone: 'danger',
    });
    if (!confirmed) return;

    setArchiveBusy(true);
    setArchiveError(null);
    try {
      await api.delete(`/admins/${admin.id}/permanent`);
      await loadArchivedAdmins();
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      setArchiveError(apiError.response?.data?.message || 'Failed to permanently delete admin account.');
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

  async function handleCreated(role: AccountRole) {
    if (role === 'admin') return loadAdmins();
    if (role === 'user') return onOpenUsers();
    if (role === 'barangay') return onOpenBarangay();
    return onOpenRescuers();
  }

  return (
    <AdminShell
      activeView="admin"
      title="Account Management"
      noMainScroll
      onLogout={onLogout}
      onOpenDashboard={onOpenDashboard}
      onOpenAdmin={() => {}}
      onOpenUsers={onOpenUsers}
        onOpenBarangay={onOpenBarangay}
      onOpenRescuers={onOpenRescuers}
      onOpenMonitoring={onOpenMonitoring}
      onOpenFloodMonitoring={onOpenFloodMonitoring}
      onOpenEvacuationAreas={onOpenEvacuationAreas}
      onOpenPostUpdates={onOpenPostUpdates}
      onOpenHistory={onOpenHistory}
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
                  placeholder="Search Admin Account"
                  className={d.admin.search}
                />
                <AddAccountDialog initialRole="admin" onCreated={handleCreated} onAuthError={onAuthError} />
              </div>
            </div>

            {error ? <div className={d.page.error}>{error}</div> : null}

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
                          <button type="button" onClick={() => { setSelectedAdmin(admin); setFormError(null); }} className={d.btn.secondaryXs}>View</button>
                          <button type="button" onClick={() => onDeleteAdmin(admin)} className={d.btn.dangerXs}>Archive</button>
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
                    {archiveError ? <p className={d.page.error} role="alert">{archiveError}</p> : null}
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
            {selectedAdmin ? (
              <AccountDetailsModal
                key={selectedAdmin.id}
                title="Admin Account"
                accountId={selectedAdmin.admin_id || `ADM-${selectedAdmin.id}`}
                initialValues={toEditValues(selectedAdmin)}
                details={[
                  { label: 'Name', value: [selectedAdmin.first_name, selectedAdmin.last_name].filter(Boolean).join(' ') || 'N/A' },
                  { label: 'Status', value: selectedAdmin.is_active ? 'Active' : 'Inactive' },
                  { label: 'Username', value: selectedAdmin.username || 'N/A' },
                  { label: 'Email', value: selectedAdmin.email || 'N/A' },
                  { label: 'Contact', value: selectedAdmin.contact_number || 'N/A' },
                  { label: 'Address', value: selectedAdmin.address || 'N/A' },
                  { label: 'Last Login', value: formatLastLogin(selectedAdmin.last_login) },
                ]}
                canEdit
                busy={saving}
                error={formError}
                onClose={() => { setSelectedAdmin(null); setFormError(null); }}
                onSave={saveAdmin}
              />
            ) : null}
        {confirmationDialog}
      </div>
    </AdminShell>
  );
}
