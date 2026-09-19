import { api } from './apiClient';

export type StaffPortal = 'admin' | 'rescuer';

export async function loginStaff(accountId: string, password: string, portal: StaffPortal) {
  const { data } = await api.post('/auth/login', { accountId, password, portal });
  const role = data?.user?.role || '';
  if (role !== portal) {
    throw new Error(`This account does not have ${portal === 'admin' ? 'Admin' : 'CDRRMD Rescuer'} access.`);
  }
  return data as { token: string; user: { role: StaffPortal } };
}
