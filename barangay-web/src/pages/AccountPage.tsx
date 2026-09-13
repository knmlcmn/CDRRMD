import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../services/apiClient';
import BarangayShell from '../components/BarangayShell';
import { d } from '../barangayDesign';
import type { BarangayUser } from '../types';

type Props = {
  barangayName: string;
  onLogout: () => void;
  onOpenMonitoring: () => void;
  onOpenFloodMonitoring: () => void;
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

function formatLastLogin(iso?: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

export default function AccountPage({ barangayName, onLogout, onOpenMonitoring, onOpenFloodMonitoring, onAuthError }: Props) {
  const [user, setUser] = useState<BarangayUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState<ProfileForm>({
    firstName: '', lastName: '', email: '',
    address: '', contactNumber: '', password: '',
  });

  async function loadProfile() {
    setLoading(true);
    try {
      const res = await api.get('/barangay/me');
      const u: BarangayUser = res.data;
      setUser(u);
      setForm({
        firstName: u.firstName || '',
        lastName: u.lastName || '',
        email: u.email || '',
        address: u.address || '',
        contactNumber: u.contactNumber || '',
        password: '',
      });
      setError(null);
    } catch (err: any) {
      if (err?.response?.status === 401) { onAuthError(); return; }
      setError(err?.response?.data?.message || 'Failed to load account.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadProfile(); }, []);

  function openEditForm() {
    setError(null);
    setSuccessMsg(null);
    setIsFormOpen(true);
  }

  async function onSubmitForm(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await api.patch('/barangay/me', {
        firstName: form.firstName.trim() || null,
        lastName: form.lastName.trim() || null,
        email: form.email.trim().toLowerCase(),
        address: form.address.trim() || null,
        contactNumber: form.contactNumber.trim() || null,
        ...(form.password.trim() ? { password: form.password.trim() } : {}),
      });
      setIsFormOpen(false);
      setSuccessMsg('Profile updated successfully.');
      await loadProfile();
    } catch (err: any) {
      if (err?.response?.status === 401) { onAuthError(); return; }
      setError(err?.response?.data?.message || 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  }

  // Build a single-row table representation like admin AdminPage
  const rows = useMemo(() => {
    if (!user) return [];
    return [user];
  }, [user]);

  const filteredRows = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((u) => {
      const fullName = `${u.firstName || ''} ${u.lastName || ''}`.trim().toLowerCase();
      return (
        fullName.includes(needle) ||
        String(u.username || '').toLowerCase().includes(needle) ||
        String(u.email || '').toLowerCase().includes(needle) ||
        String(u.contactNumber || '').toLowerCase().includes(needle)
      );
    });
  }, [rows, searchTerm]);

  return (
    <BarangayShell
      activeView="account"
      title="Barangay Account Management"
      barangayName={barangayName}
      onLogout={onLogout}
      onOpenMonitoring={onOpenMonitoring}
      onOpenFloodMonitoring={onOpenFloodMonitoring}
      onOpenAccount={() => {}}
    >
      <div className={d.admin.root}>
        <div className={d.admin.headerRow}>
          <h2 className={d.admin.title}>Barangay Account Management</h2>
          <div className={d.admin.searchRow}>
            <button type="button" onClick={openEditForm} className={d.admin.actionAdd || d.btn.primary}>
              Edit My Profile
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
        {successMsg ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 mb-2">
            {successMsg}
          </div>
        ) : null}

        {/* Edit form — mirrors AdminPage form grid */}
        {isFormOpen ? (
          <form onSubmit={onSubmitForm} className={d.admin.form}>
            <div className={d.admin.idBox}>
              Editing: Brgy. {barangayName} Portal Account
            </div>
            <input
              value={form.firstName}
              onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
              placeholder="First Name"
              className={d.form.inputSm}
            />
            <input
              value={form.lastName}
              onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
              placeholder="Last Name"
              className={d.form.inputSm}
            />
            <input
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="Email"
              type="email"
              className={d.form.inputSm}
              required
            />
            <input
              value={form.contactNumber}
              onChange={(e) => setForm((p) => ({ ...p, contactNumber: e.target.value }))}
              placeholder="Contact Number"
              className={d.form.inputSm}
            />
            <input
              value={form.address}
              onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
              placeholder="Address"
              className={d.form.inputSm}
            />
            <input
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              placeholder="New Password (leave blank to keep)"
              type="password"
              className={d.form.inputSm}
            />
            <div className={d.admin.formActions}>
              <button disabled={saving} className={d.btn.emerald}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button type="button" onClick={() => setIsFormOpen(false)} className={d.btn.secondary}>
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {/* Account table — same columns as AdminPage: ID, NAME, EMAIL, USERNAME, CONTACT, STATUS, LAST LOGIN, ACTIONS */}
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
              {loading ? (
                <tr>
                  <td colSpan={8} className={d.table.empty}>Loading…</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className={d.table.empty}>No account found.</td>
                </tr>
              ) : filteredRows.map((u) => (
                <tr key={u.id} className={d.admin.row}>
                  <td>
                    <span>{`BRG-${String(u.id).padStart(5, '0')}`}</span>
                    <span className="ml-1 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded px-1 py-0.5 align-middle">You</span>
                  </td>
                  <td className={d.admin.truncate}>
                    {`${u.firstName || ''} ${u.lastName || ''}`.trim() || 'N/A'}
                  </td>
                  <td className={d.admin.tdHiddenTruncateMd}>{u.email || 'N/A'}</td>
                  <td className={d.admin.tdHiddenLg}>{u.username || 'N/A'}</td>
                  <td className={d.admin.tdHiddenLg}>{u.contactNumber || 'N/A'}</td>
                  <td className={d.admin.thHiddenMd}>
                    {(u as any).isActive !== false
                      ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />Active
                        </span>
                      : <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />Inactive
                        </span>
                    }
                  </td>
                  <td className={`${d.admin.tdHiddenTruncateXl} text-xs text-slate-500`}>
                    {formatLastLogin((u as any).lastLogin)}
                  </td>
                  <td>
                    <div className={d.admin.actions}>
                      <button onClick={openEditForm} className={d.btn.secondaryXs}>
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading ? <p className={d.page.loading}>Loading…</p> : null}
      </div>
    </BarangayShell>
  );
}
