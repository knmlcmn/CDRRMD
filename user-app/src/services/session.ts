import AsyncStorage from '@react-native-async-storage/async-storage';

export type SessionUser = {
  id: number;
  username: string;
  role: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  address?: string;
  contactNumber?: string;
  barangayName?: string | null;
  profileImage?: string | null;
  accountId?: string | null;
};

export type SessionData = {
  token: string;
  refreshToken?: string;
  user: SessionUser;
  appUserId?: string;
};

const SESSION_KEY = '@cddrmd:user_session';
export type AuthorizationUpdateReason = 'session' | 'refresh';
let applyAuthorizationHeader: ((token: string | null, reason?: AuthorizationUpdateReason) => void) | null = null;
let sessionStorageQueue: Promise<unknown> = Promise.resolve();

function enqueueSessionStorage<T>(operation: () => Promise<T>) {
  const request = sessionStorageQueue.catch(() => {}).then(operation);
  sessionStorageQueue = request.catch(() => {});
  return request;
}

export function registerSessionAuthorizationSetter(
  setter: (token: string | null, reason?: AuthorizationUpdateReason) => void,
) {
  // Allows API layer to stay synchronized with persisted session state.
  applyAuthorizationHeader = setter;
}

export async function saveSession(
  session: SessionData,
  isCurrent: () => boolean = () => true,
  authorizationReason: AuthorizationUpdateReason = 'session',
) {
  // Persist session snapshot and immediately apply bearer token.
  return enqueueSessionStorage(async () => {
    if (!isCurrent()) return false;
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    if (!isCurrent()) return false;
    applyAuthorizationHeader?.(session.token, authorizationReason);
    return true;
  });
}

export async function clearSession() {
  // Revoke runtime authorization synchronously so navigation and request
  // cleanup never wait on the native storage bridge during logout.
  applyAuthorizationHeader?.(null);
  await enqueueSessionStorage(() => AsyncStorage.removeItem(SESSION_KEY));
}

export async function loadSession(): Promise<SessionData | null> {
  // Restore session and re-apply token after app relaunch.
  await sessionStorageQueue.catch(() => {});
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as SessionData;
    if (!parsed?.token || !parsed?.user) {
      return null;
    }
    applyAuthorizationHeader?.(parsed.token);
    return parsed;
  } catch {
    return null;
  }
}
