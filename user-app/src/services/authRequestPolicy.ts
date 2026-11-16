export function isCurrentAuthRequest(requestGeneration: unknown, currentGeneration: number) {
  return typeof requestGeneration !== 'number' || requestGeneration === currentGeneration;
}

export function isRefreshableAuthFailure(status: unknown, code: unknown, message: unknown) {
  const normalizedCode = String(code || '');
  return status === 401 && (
    normalizedCode.startsWith('AUTH_TOKEN_')
    || normalizedCode === 'AUTH_SESSION_INVALID'
    || /token/i.test(String(message || ''))
  );
}

export function shouldRetryRotatedAccessToken({
  status,
  code,
  retried,
  requestAuthorization,
  currentAuthorization,
}: {
  status: unknown;
  code: unknown;
  retried: unknown;
  requestAuthorization: unknown;
  currentAuthorization: unknown;
}) {
  const requestToken = String(requestAuthorization || '');
  const currentToken = String(currentAuthorization || '');
  return status === 401
    && code === 'AUTH_SESSION_INVALID'
    && !retried
    && Boolean(requestToken)
    && Boolean(currentToken)
    && requestToken !== currentToken;
}

type AuthSessionIdentity = {
  token?: unknown;
  user?: { id?: unknown; role?: unknown } | null;
} | null | undefined;

export function handleAuthFailureIfSessionActive(
  activeSession: unknown,
  handleFailure: () => void,
) {
  if (!activeSession) return false;
  handleFailure();
  return true;
}

export function handleAuthFailureForSession(
  expectedSession: AuthSessionIdentity,
  activeSession: AuthSessionIdentity,
  handleFailure: () => void,
) {
  if (!expectedSession || !activeSession) return false;
  if (
    expectedSession.token !== activeSession.token
    || expectedSession.user?.id !== activeSession.user?.id
    || expectedSession.user?.role !== activeSession.user?.role
  ) return false;
  handleFailure();
  return true;
}
