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
};

export type SessionData = {
  token: string;
  refreshToken?: string;
  user: SessionUser;
  appUserId?: string;
};

const SESSION_KEY = '@cddrmd:user_session';
let applyAuthorizationHeader: ((token: string | null) => void) | null = null;

export function registerSessionAuthorizationSetter(setter: (token: string | null) => void) {
  // Allows API layer to stay synchronized with persisted session state.
  applyAuthorizationHeader = setter;
}

export async function saveSession(session: SessionData) {
  // Persist session snapshot and immediately apply bearer token.
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  applyAuthorizationHeader?.(session.token);
}

export async function clearSession() {
  // Clear both storage and runtime auth header.
  await AsyncStorage.removeItem(SESSION_KEY);
  applyAuthorizationHeader?.(null);
}

export async function loadSession(): Promise<SessionData | null> {
  // Restore session and re-apply token after app relaunch.
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
