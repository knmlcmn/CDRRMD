import { useState, type FormEvent } from 'react';
import { d } from '../adminDesign';
import { api } from '../services/apiClient';

export type AccountRole = 'admin' | 'user' | 'barangay' | 'rescuer';

type Props = {
  initialRole: AccountRole;
  initialRescuerRole?: AccountForm['rescuerRole'];
  onCreated: (role: AccountRole) => void | Promise<void>;
  onAuthError: () => void;
};

type AccountForm = {
  role: AccountRole;
  rescuerRole: 'rescuer' | 'barangay_rescuer';
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  contactNumber: string;
  address: string;
  barangayName: string;
};

const BARANGAYS = ['Lingga', 'Looc', 'Palingon', 'Parian', 'Sampiruhan', 'Uwisan'];

function emptyForm(role: AccountRole, rescuerRole: AccountForm['rescuerRole'] = 'rescuer'): AccountForm {
  return {
    role,
    rescuerRole,
    username: '',
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    contactNumber: '',
    address: '',
    barangayName: BARANGAYS[0],
  };
}

function createEndpoint(form: AccountForm) {
  if (form.role === 'admin') return '/admins';
  if (form.role === 'user') return '/admins/users';
  if (form.role === 'barangay') return '/barangay/accounts';
  return '/rescuers/accounts';
}

export default function AddAccountDialog({ initialRole, initialRescuerRole = 'rescuer', onCreated, onAuthError }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<AccountForm>(() => emptyForm(initialRole, initialRescuerRole));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function openDialog() {
    setForm(emptyForm(initialRole, initialRescuerRole));
    setError('');
    setIsOpen(true);
  }

  function closeDialog() {
    if (!saving) setIsOpen(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const payload = {
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        contactNumber: form.contactNumber.trim(),
        address: form.address.trim(),
        ...(form.role === 'barangay' ? { barangayName: form.barangayName } : {}),
        ...(form.role === 'rescuer' ? {
          role: form.rescuerRole,
          barangayName: form.rescuerRole === 'barangay_rescuer' ? form.barangayName : undefined,
        } : {}),
      };

      await api.post(createEndpoint(form), payload);
      setIsOpen(false);
      await onCreated(form.role);
    } catch (requestError: unknown) {
      const apiError = requestError as { response?: { status?: number; data?: { message?: string } } };
      if (apiError.response?.status === 401) {
        onAuthError();
        return;
      }
      setError(apiError.response?.data?.message || 'Failed to create account.');
    } finally {
      setSaving(false);
    }
  }

  const needsBarangay = form.role === 'barangay'
    || (form.role === 'rescuer' && form.rescuerRole === 'barangay_rescuer');
  const labelClass = 'flex flex-col gap-2 text-base font-bold text-slate-700';
  const fieldClass = 'h-12 w-full rounded-lg border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-600 focus:ring-2 focus:ring-sky-100';

  return (
    <>
      <button type="button" onClick={openDialog} className={`${d.admin.actionAdd} whitespace-nowrap`}>Add Account</button>

      {isOpen ? (
        <div className={d.modal.overlay} role="dialog" aria-modal="true" aria-labelledby="add-account-title">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
            <div className={d.modal.header}>
              <div>
                <h3 id="add-account-title" className="text-2xl font-black text-[#1a3650]">Add Account</h3>
                <p className="mt-1.5 text-base text-slate-500">Choose a role, then enter the new account details.</p>
              </div>
              <button type="button" onClick={closeDialog} className={`${d.modal.close} h-10 px-4 text-base`} disabled={saving}>Close</button>
            </div>

            <form onSubmit={submit} className="mt-6 grid items-end gap-x-5 gap-y-4 sm:grid-cols-2">
              <label className={labelClass}>Role
                <select
                  className={fieldClass}
                  value={form.role}
                  onChange={(event) => setForm(emptyForm(event.target.value as AccountRole))}
                >
                  <option value="admin">Admin</option>
                  <option value="user">User</option>
                  <option value="barangay">Barangay</option>
                  <option value="rescuer">Rescuer</option>
                </select>
              </label>

              {form.role === 'rescuer' ? (
                <label className={labelClass}>Rescuer Type
                  <select
                    className={fieldClass}
                    value={form.rescuerRole}
                    onChange={(event) => setForm((current) => ({ ...current, rescuerRole: event.target.value as AccountForm['rescuerRole'] }))}
                  >
                    <option value="rescuer">CDRRMD Rescuer</option>
                    <option value="barangay_rescuer">Barangay Rescuer</option>
                  </select>
                </label>
              ) : null}

              {needsBarangay ? (
                <label className={labelClass}>Barangay
                  <select className={fieldClass} value={form.barangayName} onChange={(event) => setForm((current) => ({ ...current, barangayName: event.target.value }))}>
                    {BARANGAYS.map((barangay) => <option key={barangay} value={barangay}>{barangay}</option>)}
                  </select>
                </label>
              ) : null}

              <label className={labelClass}>Username
                <input className={fieldClass} required placeholder="Enter username" value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} />
              </label>
              <label className={labelClass}>Email
                <input className={fieldClass} required type="email" placeholder="Enter email address" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
              </label>
              <label className={labelClass}>Password
                <input className={fieldClass} required minLength={6} type="password" autoComplete="new-password" placeholder="At least 6 characters" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
              </label>
              <label className={labelClass}>First Name
                <input className={fieldClass} placeholder="Enter first name" value={form.firstName} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} />
              </label>
              <label className={labelClass}>Last Name
                <input className={fieldClass} placeholder="Enter last name" value={form.lastName} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} />
              </label>
              <label className={labelClass}>Contact Number
                <input className={fieldClass} placeholder="Enter contact number" value={form.contactNumber} onChange={(event) => setForm((current) => ({ ...current, contactNumber: event.target.value }))} />
              </label>
              <label className={`${labelClass} sm:col-span-2`}>Address
                <input className={fieldClass} placeholder="Enter complete address" value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} />
              </label>

              {error ? <p className={`${d.page.error} sm:col-span-2`}>{error}</p> : null}

              <div className="mt-2 flex justify-end gap-3 border-t border-slate-200 pt-5 sm:col-span-2">
                <button type="button" onClick={closeDialog} className={`${d.btn.secondary} min-h-12 px-6 text-base`} disabled={saving}>Cancel</button>
                <button type="submit" className={`${d.btn.primary} min-h-12 px-6 text-base`} disabled={saving}>{saving ? 'Creating...' : 'Create Account'}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
