import axios from 'axios';

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD ? '/api' : 'http://localhost:4000/api');
const ADMIN_TOKEN_KEY = 'admin_token';

export const api = axios.create({
  baseURL: API_BASE_URL,
});

const pendingGetRequests = new Map<string, Promise<unknown>>();
const originalGet = api.get.bind(api);
let authRequestGeneration = 0;
let currentAuthToken: string | null = null;

function stableRequestValue(value: unknown) {
  if (!value || typeof value !== 'object') return String(value ?? '');
  return JSON.stringify(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)));
}

// Coalesce only simultaneous identical GETs. Results are not retained after a
// request settles, so live emergency feeds still receive their next poll.
api.get = ((url: string, config?: Parameters<typeof originalGet>[1]) => {
  const headers = config?.headers as Record<string, unknown> | undefined;
  const explicitAuthorization = String(headers?.Authorization || headers?.authorization || '');
  const key = [
    authRequestGeneration,
    explicitAuthorization,
    config?.baseURL || api.defaults.baseURL || '',
    url,
    stableRequestValue(config?.params),
    config?.responseType || 'json',
  ].join('|');
  const pending = pendingGetRequests.get(key);
  if (pending) return pending;

  const request = originalGet(url, config).finally(() => pendingGetRequests.delete(key));
  pendingGetRequests.set(key, request);
  return request;
}) as typeof api.get;

function getStoredToken() {
  if (typeof window === 'undefined') {
    return null;
  }

  return localStorage.getItem(ADMIN_TOKEN_KEY) || sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

function applyAuthorizationHeader(token: string | null) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    return;
  }

  delete api.defaults.headers.common.Authorization;
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
  if (token !== currentAuthToken) authRequestGeneration += 1;
  currentAuthToken = token;
  applyAuthorizationHeader(token);
}
