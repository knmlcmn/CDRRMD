import type { SessionData } from './session';

type LocationBarangayResponse = {
  user?: SessionData['user'] | null;
  barangayName?: string | null;
};

export function applyAuthoritativeJurisdiction(
  currentUser: SessionData['user'],
  response: LocationBarangayResponse,
): SessionData['user'] {
  const assignedUser = response.user;
  const currentJurisdiction = String(response.barangayName || '').trim();
  if (!assignedUser?.id || !currentJurisdiction) {
    throw new Error('The current activity barangay could not be determined.');
  }

  return {
    ...currentUser,
    ...assignedUser,
    // The top-level value is resolved from the current GPS position. The
    // nested user value remains registration/profile information for older
    // deployed clients and must not override the active jurisdiction.
    barangayName: currentJurisdiction,
  };
}
