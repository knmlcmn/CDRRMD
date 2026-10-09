import { useState, type FormEvent } from 'react';
import { d } from '../adminDesign';

export type AccountEditValues = {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  address: string;
  contactNumber: string;
  barangayName: string;
};

type Detail = {
  label: string;
  value: string;
};

type Props = {
  title: string;
  accountId: string;
  initialValues: AccountEditValues;
  details: Detail[];
  busy: boolean;
  error?: string | null;
  barangayOptions?: string[];
  addressPlaceholder?: string;
  onClose: () => void;
  onSave: (values: AccountEditValues) => Promise<void>;
};

export default function AccountDetailsModal({
  title,
  accountId,
  initialValues,
  details,
  busy,
  error,
  barangayOptions,
  addressPlaceholder = 'Address',
  onClose,
  onSave,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(initialValues);

  function update(field: keyof AccountEditValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSave(values);
  }

  return (
    <div className={d.modal.overlay} role="dialog" aria-modal="true" aria-label={`View ${title.toLowerCase()}`}>
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-black text-[#1a3650]">{title}</h3>
            <p className="text-xs text-slate-500">{accountId}</p>
          </div>
          <div className="flex items-center gap-2">
            {!editing ? <button type="button" onClick={() => setEditing(true)} className={d.btn.secondary}>Edit Account</button> : null}
            <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-lg font-bold text-slate-600 hover:bg-slate-100" aria-label="Close">X</button>
          </div>
        </div>

        <div className="max-h-[75dvh] overflow-y-auto p-5">
          {editing ? (
            <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
              <input value={values.firstName} onChange={(event) => update('firstName', event.target.value)} placeholder="First Name" className={d.form.input} />
              <input value={values.lastName} onChange={(event) => update('lastName', event.target.value)} placeholder="Last Name" className={d.form.input} />
              <input value={values.email} onChange={(event) => update('email', event.target.value)} placeholder="Email" type="email" className={d.form.input} required />
              <input value={values.username} onChange={(event) => update('username', event.target.value)} placeholder="Username" className={d.form.input} required />
              <input value={values.contactNumber} onChange={(event) => update('contactNumber', event.target.value)} placeholder="Contact Number" className={d.form.input} />
              <input value={values.address} onChange={(event) => update('address', event.target.value)} placeholder={addressPlaceholder} className={d.form.input} />
              {barangayOptions ? (
                <select value={values.barangayName} onChange={(event) => update('barangayName', event.target.value)} className={d.form.input} aria-label="Barangay" required>
                  <option value="" disabled>Select barangay</option>
                  {barangayOptions.map((barangay) => <option key={barangay} value={barangay}>{barangay}</option>)}
                </select>
              ) : null}
              <input value={values.password} onChange={(event) => update('password', event.target.value)} placeholder="New password (optional)" type="password" autoComplete="new-password" className={`${d.form.input} ${barangayOptions ? '' : 'sm:col-span-2'}`} />
              {error ? <p className={`${d.page.error} sm:col-span-2`}>{error}</p> : null}
              <div className="flex justify-end gap-2 sm:col-span-2">
                <button type="button" onClick={() => { setValues(initialValues); setEditing(false); }} className={d.btn.secondary} disabled={busy}>Cancel</button>
                <button type="submit" className={d.btn.primary} disabled={busy}>{busy ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </form>
          ) : (
            <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-2">
              {details.map((detail) => (
                <p key={detail.label}><span className="font-bold text-slate-600">{detail.label}:</span> {detail.value || 'N/A'}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
