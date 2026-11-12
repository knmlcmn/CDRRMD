export const RESPONDER_PRESENCE_TTL_MS = 45_000;
export const RESPONDER_FUTURE_TOLERANCE_MS = 5_000;

export type ResponderLocationRecord = {
  is_online?: boolean | null;
  current_latitude?: number | string | null;
  current_longitude?: number | string | null;
  location_updated_at?: string | null;
};

export function hasFreshResponderCoordinates(
  responder: ResponderLocationRecord | null | undefined,
  now = Date.now(),
) {
  if (!responder
    || responder.current_latitude === null || responder.current_latitude === undefined || responder.current_latitude === ''
    || responder.current_longitude === null || responder.current_longitude === undefined || responder.current_longitude === '') {
    return false;
  }

  const latitude = Number(responder.current_latitude);
  const longitude = Number(responder.current_longitude);
  const updatedAt = Date.parse(String(responder.location_updated_at || ''));
  const ageMs = now - updatedAt;

  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    && Number.isFinite(updatedAt)
    && ageMs >= -RESPONDER_FUTURE_TOLERANCE_MS
    && ageMs <= RESPONDER_PRESENCE_TTL_MS;
}

export function isLiveResponderAccount(
  responder: ResponderLocationRecord | null | undefined,
  now = Date.now(),
) {
  return responder?.is_online === true && hasFreshResponderCoordinates(responder, now);
}

export function liveResponderCoordinate(
  responder: ResponderLocationRecord | null | undefined,
  now = Date.now(),
) {
  if (!isLiveResponderAccount(responder, now)) return null;
  return {
    latitude: Number(responder?.current_latitude),
    longitude: Number(responder?.current_longitude),
  };
}
