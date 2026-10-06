import axios from 'axios';
import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';
import { clearSession, loadSession, saveSession, SessionData } from './session';

function parseHost(value?: string | null) {
  // Accept either full URL or host:port values and normalize to host only.
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const withoutProtocol = trimmed.replace(/^https?:\/\//, '');
    return withoutProtocol.split('/')[0].split(':')[0] || null;
  }

  return trimmed.split(':')[0];
}

function normalizeBaseHost(value?: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim().replace(/\/$/, '');
  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/api$/i, '');
  }

  const hostOnly = parseHost(trimmed);
  if (!hostOnly) {
    return null;
  }

  return `http://${hostOnly}:4000`;
}

function unique(values: Array<string | null | undefined>) {
  const set = new Set<string>();
  values.forEach((value) => {
    if (value) {
      set.add(value);
    }
  });
  return Array.from(set);
}

function buildCandidateHosts() {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  const envBase = normalizeBaseHost(envUrl);

  const expoHostUri =
    (Constants.expoConfig as { hostUri?: string } | null)?.hostUri ||
    (Constants as unknown as { manifest?: { debuggerHost?: string } }).manifest?.debuggerHost ||
    (Constants as unknown as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig
      ?.debuggerHost;

  const scriptHost = parseHost(
    (NativeModules as { SourceCode?: { scriptURL?: string } }).SourceCode?.scriptURL ?? null,
  );

  const expoHost = parseHost(expoHostUri ?? null);

  const hosts = unique([
    scriptHost,
    expoHost,
    Platform.OS === 'android' ? '10.0.2.2' : null,
    'localhost',
    '127.0.0.1',
  ]);

  const discovered = hosts.map((host) => `http://${host}:4000`);
  return unique([envBase, ...discovered]);
}

const candidateHosts = buildCandidateHosts();
let activeHost = candidateHosts[0] ?? (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');
let resolvingHostPromise: Promise<string> | null = null;

export function setApiHost(host: string) {
  activeHost = host.replace(/\/$/, '');
  api.defaults.baseURL = `${activeHost}/api`;
}

export function getApiHost() {
  return activeHost;
}

const baseHost = activeHost;

function isConnectivityError(error: unknown) {
  // Differentiate network failures from backend business errors.
  const err = error as { code?: string; message?: string; response?: unknown };
  if (err?.response) {
    return false;
  }

  const code = err?.code ?? '';
  if (['ECONNABORTED', 'ERR_NETWORK', 'ENOTFOUND', 'ECONNREFUSED', 'EHOSTUNREACH'].includes(code)) {
    return true;
  }

  const message = String(err?.message ?? '').toLowerCase();
  return message.includes('network') || message.includes('timeout') || message.includes('connect');
}

export const api = axios.create({
  baseURL: `${baseHost}/api`,
  timeout: 15000,
});

let refreshingPromise: Promise<SessionData | null> | null = null;
let authFailureHandler: (() => void) | null = null;

export function setApiAuthorizationToken(token: string | null) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    return;
  }
  delete api.defaults.headers.common.Authorization;
}

export function setAuthFailureHandler(handler: (() => void) | null) {
  authFailureHandler = handler;
}

async function refreshAccessToken() {
  if (refreshingPromise) {
    // Deduplicate concurrent refresh attempts triggered by multiple requests.
    return refreshingPromise;
  }

  refreshingPromise = (async () => {
    const current = await loadSession();
    const refreshToken = String(current?.refreshToken || '').trim();
    if (!current || !refreshToken) {
      await clearSession();
      authFailureHandler?.();
      return null;
    }

    const host = await getHealthyHost();
    const response = await axios.post(`${host}/api/auth/refresh`, { refreshToken }, { timeout: 15000 });
    setApiHost(host);

    const nextSession: SessionData = {
      ...current,
      token: response.data?.token,
      refreshToken: response.data?.refreshToken || refreshToken,
      user: response.data?.user || current.user,
    };

    if (!nextSession.token) {
      throw new Error('Missing access token in refresh response.');
    }

    await saveSession(nextSession);
    return nextSession;
  })()
    .catch(async () => {
      await clearSession();
      authFailureHandler?.();
      return null;
    })
    .finally(() => {
      refreshingPromise = null;
    });

  return refreshingPromise;
}

api.interceptors.request.use(async (config) => {
  const headers = config.headers as Record<string, string> | undefined;
  const token =
    headers?.Authorization ||
    headers?.authorization ||
    (api.defaults.headers.common.Authorization as string | undefined);
  if (!token) {
    const session = await loadSession();
    if (session?.token) {
      const nextHeaders = (config.headers || {}) as Record<string, string>;
      nextHeaders.Authorization = `Bearer ${session.token}`;
      config.headers = nextHeaders as any;
      setApiAuthorizationToken(session.token);
    }
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error?.config || {};

    if (isConnectivityError(error) && !original.__hostRetried) {
      original.__hostRetried = true;
      const nextHost = await resolveHealthyHost();
      setApiHost(nextHost);
      original.baseURL = `${nextHost}/api`;
      return api.request(original);
    }

    const status = error?.response?.status;
    const code = String(error?.response?.data?.code || '');

    const tokenProblem =
      status === 401 &&
      (code.startsWith('AUTH_TOKEN_') || /token/i.test(String(error?.response?.data?.message || '')));
    if (!tokenProblem || original.__retried) {
      throw error;
    }

    const refreshedSession = await refreshAccessToken();
    if (!refreshedSession?.token) {
      await clearSession();
      authFailureHandler?.();
      throw error;
    }

    original.__retried = true;
    original.headers = original.headers || {};
    original.headers.Authorization = `Bearer ${refreshedSession.token}`;
    return api.request(original);
  },
);

async function isHealthyHost(host: string) {
  try {
    const response = await axios.get(`${host}/api/health`, { timeout: 5000 });
    return response?.data?.status === 'ok';
  } catch {
    return false;
  }
}

async function resolveHealthyHost() {
  // Probe known hosts until a healthy backend is found.
  for (const host of unique([activeHost, ...candidateHosts])) {
    const healthy = await isHealthyHost(host);
    if (healthy) {
      setApiHost(host);
      return host;
    }
  }

  return activeHost;
}

async function getHealthyHost() {
  if (!resolvingHostPromise) {
    resolvingHostPromise = resolveHealthyHost().finally(() => {
      resolvingHostPromise = null;
    });
  }

  return resolvingHostPromise;
}

export async function postAuth(path: '/auth/login' | '/auth/register', payload: unknown) {
  const host = await getHealthyHost();

  try {
    const response = await axios.post(`${host}/api${path}`, payload, { timeout: 15000 });
    setApiHost(host);

    // Role isolation: barangay and admin accounts cannot log in via the user app
    if (path === '/auth/login') {
      const role = response.data?.user?.role || '';
      if (role === 'barangay') {
        throw Object.assign(new Error('Barangay accounts must log in via the Barangay Portal.'), { isRoleError: true });
      }
      if (role === 'admin') {
        throw Object.assign(new Error('Admin accounts cannot log in here. Use the Admin Portal.'), { isRoleError: true });
      }
    }

    if (response.data?.token) {
      setApiAuthorizationToken(response.data.token);
    }
    return response;
  } catch (error) {
    if ((error as any).isRoleError) throw error;
    if (!isConnectivityError(error)) {
      throw error;
    }

    const nextHost = await resolveHealthyHost();
    const response = await axios.post(`${nextHost}/api${path}`, payload, { timeout: 15000 });
    setApiHost(nextHost);

    if (path === '/auth/login') {
      const role = response.data?.user?.role || '';
      if (role === 'barangay') {
        throw Object.assign(new Error('Barangay accounts must log in via the Barangay Portal.'), { isRoleError: true });
      }
      if (role === 'admin') {
        throw Object.assign(new Error('Admin accounts cannot log in here. Use the Admin Portal.'), { isRoleError: true });
      }
    }

    if (response.data?.token) {
      setApiAuthorizationToken(response.data.token);
    }
    return response;
  }
}

export async function getAuthMe() {
  const host = await getHealthyHost();

  try {
    const response = await api.get('/auth/me');
    setApiHost(host);
    return response;
  } catch (error) {
    if (!isConnectivityError(error)) {
      throw error;
    }

    const nextHost = await resolveHealthyHost();
    setApiHost(nextHost);
    return api.get('/auth/me');
  }
}

export async function putAuthMe(payload: {
  firstName?: string;
  lastName?: string;
  email?: string;
  address?: string;
  contactNumber?: string;
  barangayName?: string;
}) {
  const host = await getHealthyHost();

  try {
    const response = await api.put('/auth/me', payload);
    setApiHost(host);
    return response;
  } catch (error) {
    if (!isConnectivityError(error)) {
      throw error;
    }

    const nextHost = await resolveHealthyHost();
    setApiHost(nextHost);
    return api.put('/auth/me', payload);
  }
}

export async function assignAuthBarangayFromLocation(latitude: number, longitude: number) {
  const host = await getHealthyHost();
  const payload = { latitude, longitude };

  try {
    const response = await api.put('/auth/location-barangay', payload);
    setApiHost(host);
    return response;
  } catch (error) {
    if (!isConnectivityError(error)) {
      throw error;
    }

    const nextHost = await resolveHealthyHost();
    setApiHost(nextHost);
    return api.put('/auth/location-barangay', payload);
  }
}

export async function resubmitAuthVerification(validIdImage: string) {
  return api.put('/auth/verification-resubmit', { validIdImage });
}
