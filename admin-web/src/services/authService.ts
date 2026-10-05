import { api } from './apiClient';

export type StaffPortal = 'admin' | 'barangay' | 'rescuer' | 'barangay_rescuer';

export function portalFromAccountId(accountId: string): StaffPortal | null {
  const prefix = accountId.trim().toUpperCase().split('-')[0];
  if (prefix === 'ADM') return 'admin';
  if (prefix === 'BRG') return 'barangay';
  if (prefix === 'RSC') return 'rescuer';
  if (prefix === 'BRS') return 'barangay_rescuer';
  return null;
}

export async function loginStaff(accountId: string, password: string) {
  const portal = portalFromAccountId(accountId);
  if (!portal) throw new Error('Use a valid ADM, BRG, RSC, or BRS account ID.');
  const { data } = await api.post('/auth/login', { accountId, password, portal });
  const role = data?.user?.role || '';
  if (role !== portal) {
    throw new Error(`This account does not have ${portal === 'admin' ? 'Admin' : portal === 'barangay' ? 'Barangay' : 'CDRRMD Rescuer'} access.`);
  }
  return data as { token: string; user: { role: StaffPortal } };
}
