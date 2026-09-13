import axios from 'axios';

export const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD ? '/api' : 'http://localhost:4000/api');

export const api = axios.create({ baseURL: API_BASE });

let currentAuthToken: string | null = null;

function getStoredToken(): string | null {
  try {
    const raw = localStorage.getItem('brgy_session') || sessionStorage.getItem('brgy_session');
    if (!raw) return null;
    const session = JSON.parse(raw);
    return session?.token || null;
  } catch {
    return null;
  }
}

function applyAuthorizationHeader(token: string | null) {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
}

// Prime axios defaults so first protected request includes auth.
currentAuthToken = getStoredToken();
applyAuthorizationHeader(currentAuthToken);

api.interceptors.request.use((config) => {
  // Re-read storage as fallback to survive hard refreshes and tab restores.
  const token = currentAuthToken || getStoredToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

export function setAuthToken(token: string | null) {
  currentAuthToken = token;
  applyAuthorizationHeader(token);
}
