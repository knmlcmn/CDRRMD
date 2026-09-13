import { api } from './apiClient';

export async function loginAdmin(accountId: string, password: string) {
  const { data } = await api.post('/auth/login', { accountId, password, portal: 'admin' });
  const role = data?.user?.role || '';
  if (role === 'barangay') {
    throw new Error('This account belongs to the Barangay Portal. Please log in at the Barangay Portal instead.');
  }
  if (role === 'user') {
    throw new Error('This account does not have admin access.');
  }
  return data as { token: string };
}
