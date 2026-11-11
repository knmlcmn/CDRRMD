export function isCurrentAuthRequest(requestGeneration: unknown, currentGeneration: number) {
  return typeof requestGeneration !== 'number' || requestGeneration === currentGeneration;
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
