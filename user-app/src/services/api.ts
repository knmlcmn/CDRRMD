import axios from 'axios';
import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';
import {
  clearSession,
  loadSession,
  saveSession,
  SessionData,
  type AuthorizationUpdateReason,
} from './session';
import {
  isCurrentAuthRequest,
  isRefreshableAuthFailure,
  shouldRetryRotatedAccessToken,
} from './authRequestPolicy';
import { beginApiRequest, endApiRequest } from '../utils/performanceDiagnostics';

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

const configuredApiBase = normalizeBaseHost(process.env.EXPO_PUBLIC_API_URL);

function buildCandidateHosts() {

  // A configured API URL is authoritative for deployed web/native builds.
  // Development host discovery is only needed when no environment URL exists.
  if (configuredApiBase) {
    return [configuredApiBase];
  }

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
  return unique(discovered);
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

api.interceptors.request.use((config) => {
  (config as any).__performanceMarker = beginApiRequest(config.method, config.url);
  return config;
});

api.interceptors.response.use(
  (response) => {
    endApiRequest((response.config as any).__performanceMarker, response.status, false);
    return response;
  },
  (error) => {
    endApiRequest((error?.config as any)?.__performanceMarker, error?.response?.status ?? null, true);
    throw error;
  },
);

const pendingGetRequests = new Map<string, Promise<unknown>>();
const originalGet = api.get.bind(api);
let authRequestGeneration = 0;

function stableRequestValue(value: unknown) {
  if (!value || typeof value !== 'object') return String(value ?? '');
  return JSON.stringify(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)));
}

// Share an in-flight response between simultaneous identical reads. This does
// not cache completed responses or delay subsequent rescue/notification polls.
api.get = ((url: string, config?: Parameters<typeof originalGet>[1]) => {
  // A caller-owned signal defines a distinct lifecycle. Sharing that promise
  // would let cancelling an obsolete SOS attempt also cancel its replacement.
  if (config?.signal) return originalGet(url, config);
  const headers = config?.headers as Record<string, unknown> | undefined;
  const explicitAuthorization = String(headers?.Authorization || headers?.authorization || '');
  const cacheControl = String(headers?.['Cache-Control'] || headers?.['cache-control'] || '');
  const key = [
    authRequestGeneration,
    explicitAuthorization,
    cacheControl,
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

let refreshingPromise: Promise<SessionData | null> | null = null;
let refreshingGeneration: number | null = null;
let authFailureHandler: (() => void) | null = null;

export function setApiAuthorizationToken(
  token: string | null,
  reason: AuthorizationUpdateReason = 'session',
) {
  const nextAuthorization = token ? `Bearer ${token}` : '';
  const currentAuthorization = String(api.defaults.headers.common.Authorization || '');
  // Refresh rotation stays within one authenticated account. Login, logout,
  // and account switching still advance the generation and invalidate every
  // request owned by the previous session.
  if (nextAuthorization !== currentAuthorization && reason !== 'refresh') authRequestGeneration += 1;

  if (token) {
    api.defaults.headers.common.Authorization = nextAuthorization;
    return;
  }
  delete api.defaults.headers.common.Authorization;
}

export function setAuthFailureHandler(handler: (() => void) | null) {
  authFailureHandler = handler;
}

async function refreshAccessToken(requestGeneration: number) {
  if (refreshingPromise && refreshingGeneration === requestGeneration) {
    // Deduplicate concurrent refresh attempts triggered by multiple requests.
    return refreshingPromise;
  }

  const refreshGeneration = requestGeneration;
  const request = (async () => {
    const current = await loadSession();
    if (refreshGeneration !== authRequestGeneration) return null;
    const refreshToken = String(current?.refreshToken || '').trim();
    if (!current || !refreshToken) {
      if (refreshGeneration === authRequestGeneration) {
        await clearSession();
        authFailureHandler?.();
      }
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

    // A logout or account switch happened while refresh was in flight. Never
    // allow that stale response to resurrect the previous authenticated user.
    if (refreshGeneration !== authRequestGeneration) return null;

    const saved = await saveSession(
      nextSession,
      () => refreshGeneration === authRequestGeneration,
      'refresh',
    );
    if (!saved || refreshGeneration !== authRequestGeneration) return null;
    return nextSession;
  })()
    .catch(async () => {
      if (refreshGeneration === authRequestGeneration) {
        await clearSession();
        authFailureHandler?.();
      }
      return null;
    })
    .finally(() => {
      if (refreshingPromise === request) {
        refreshingPromise = null;
        refreshingGeneration = null;
      }
    });

  refreshingPromise = request;
  refreshingGeneration = refreshGeneration;
  return request;
}

api.interceptors.request.use(async (config) => {
  const authConfig = config as any;
  // Keep the original generation through retries. A delayed request from a
  // logged-out resident must never become a request owned by a new rescuer.
  if (typeof authConfig.__authRequestGeneration !== 'number') {
    authConfig.__authRequestGeneration = authRequestGeneration;
  }
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
      authConfig.__authRequestGeneration = authRequestGeneration;
    }
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error?.config || {};

    // Responses from a logged-out or replaced account must not retry, refresh,
    // or clear the new account's session.
    if (!isCurrentAuthRequest(original.__authRequestGeneration, authRequestGeneration)) {
      throw error;
    }

    if (isConnectivityError(error) && !original.__hostRetried && !configuredApiBase) {
      original.__hostRetried = true;
      const nextHost = await resolveHealthyHost();
      setApiHost(nextHost);
      original.baseURL = `${nextHost}/api`;
      return api.request(original);
    }

    const status = error?.response?.status;
    const code = String(error?.response?.data?.code || '');

    if (status === 401 && code === 'TEST_ACCOUNT_EXPIRED') {
      await clearSession();
      authFailureHandler?.();
      throw error;
    }

    const requestAuthorization = String(original.headers?.Authorization || original.headers?.authorization || '');
    const currentAuthorization = String(api.defaults.headers.common.Authorization || '');
    if (shouldRetryRotatedAccessToken({
      status,
      code,
      retried: original.__retried,
      requestAuthorization,
      currentAuthorization,
    })) {
      original.__retried = true;
      original.headers = original.headers || {};
      original.headers.Authorization = currentAuthorization;
      return api.request(original);
    }

    const tokenProblem = isRefreshableAuthFailure(
      status,
      code,
      error?.response?.data?.message,
    );
    if (!tokenProblem || original.__retried || original.__skipAuthRefresh) {
      throw error;
    }

    const refreshedSession = await refreshAccessToken(original.__authRequestGeneration);
    if (!refreshedSession?.token) {
      if (!isCurrentAuthRequest(original.__authRequestGeneration, authRequestGeneration)) throw error;
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
  // Production has one authoritative API endpoint. Retrying a real network
  // failure is useful; probing /health before every auth/profile/location call
  // only adds another complete mobile round trip.
  if (configuredApiBase) return activeHost;
  if (!resolvingHostPromise) {
    resolvingHostPromise = resolveHealthyHost().finally(() => {
      resolvingHostPromise = null;
    });
  }

  return resolvingHostPromise;
}

type PublicAuthPath =
  | '/auth/login'
  | '/auth/register'
  | '/auth/registration-otp'
  | '/auth/password-reset-otp'
  | '/auth/password-reset';

export async function postAuth(path: PublicAuthPath, payload: unknown) {
  const host = await getHealthyHost();
  const timeout = path === '/auth/register' ? 30000 : 15000;
  const marker = beginApiRequest('POST', path);

  try {
    const response = await axios.post(`${host}/api${path}`, payload, { timeout });
    endApiRequest(marker, response.status, false);
    setApiHost(host);

    if (response.data?.token) {
      setApiAuthorizationToken(response.data.token);
    }
    return response;
  } catch (error) {
    if (!isConnectivityError(error)) {
      endApiRequest(marker, (error as any)?.response?.status ?? null, true);
      throw error;
    }

    // Deployed builds have one authoritative backend. Probing and retrying the
    // same Vercel host turned a 15-second failure into a hidden ~35-second wait.
    // Surface the bounded error and let the user choose a visible retry.
    if (configuredApiBase) {
      endApiRequest(marker, (error as any)?.response?.status ?? null, true);
      throw error;
    }

    try {
      const nextHost = await resolveHealthyHost();
      const response = await axios.post(`${nextHost}/api${path}`, payload, { timeout });
      endApiRequest(marker, response.status, false);
      setApiHost(nextHost);

      if (response.data?.token) {
        setApiAuthorizationToken(response.data.token);
      }
      return response;
    } catch (retryError) {
      endApiRequest(marker, (retryError as any)?.response?.status ?? null, true);
      throw retryError;
    }
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

export function logoutAuthSession(accessToken: string) {
  return api.post('/auth/logout', undefined, {
    headers: { Authorization: `Bearer ${accessToken}` },
    __skipAuthRefresh: true,
  } as any);
}

export async function putAuthMe(payload: {
  firstName?: string;
  lastName?: string;
  email?: string;
  address?: string;
  contactNumber?: string;
  barangayName?: string;
  profileImage?: string;
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

export async function assignAuthBarangayFromLocation(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
) {
  const host = await getHealthyHost();
  const payload = { latitude, longitude };

  try {
    const response = await api.put('/auth/location-barangay', payload, { signal });
    setApiHost(host);
    return response;
  } catch (error) {
    if (signal?.aborted || configuredApiBase || !isConnectivityError(error)) {
      throw error;
    }

    const nextHost = await resolveHealthyHost();
    setApiHost(nextHost);
    return api.put('/auth/location-barangay', payload, { signal });
  }
}

export async function previewRescueRouting(
  latitude: number,
  longitude: number,
  testModeEnabled: boolean,
  signal?: AbortSignal,
) {
  try {
    return await api.post<{
    handlingBarangay: string;
    outsideNormalServiceArea: boolean;
    selectionMethod: 'containing-polygon' | 'nearest-polygon-boundary';
    distanceToBoundaryKm: number | null;
    }>('/reports/routing-preview', { latitude, longitude, testModeEnabled }, { signal });
  } catch (error: any) {
    const status = Number(error?.response?.status || 0);
    if (signal?.aborted || (status !== 404 && status !== 405)) throw error;
    if (testModeEnabled) {
      throw Object.assign(new Error('The server must be updated before Test Mode rescue routing can be used.'), {
        response: {
          status: 426,
          data: {
            code: 'ROUTING_PREVIEW_UPGRADE_REQUIRED',
            message: 'The server must be updated before Test Mode rescue routing can be used.',
          },
        },
      });
    }

    // Old servers can still authoritatively validate an in-polygon location.
    // Never use this fallback for Test Mode because the old endpoint cannot
    // perform nearest-polygon-boundary selection.
    const legacyResponse = await assignAuthBarangayFromLocation(latitude, longitude, signal);
    const handlingBarangay = String(legacyResponse.data?.barangayName || '').trim();
    return {
      ...legacyResponse,
      data: {
        handlingBarangay,
        outsideNormalServiceArea: false,
        selectionMethod: 'containing-polygon' as const,
        distanceToBoundaryKm: null,
      },
    };
  }
}
