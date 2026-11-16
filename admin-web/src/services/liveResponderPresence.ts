export const RESPONDER_PRESENCE_TTL_MS = 45_000;
export const RESPONDER_FUTURE_TOLERANCE_MS = 5_000;

export type LiveResponderRecord = {
  is_online?: boolean | null;
  current_latitude?: number | string | null;
  current_longitude?: number | string | null;
  location_updated_at?: string | null;
};

export function liveResponderCoordinate(responder: LiveResponderRecord | null | undefined, now = Date.now()) {
  if (responder?.is_online !== true
    || responder.current_latitude === null || responder.current_latitude === undefined || responder.current_latitude === ''
    || responder.current_longitude === null || responder.current_longitude === undefined || responder.current_longitude === '') return null;
  const latitude = Number(responder.current_latitude);
  const longitude = Number(responder.current_longitude);
  const updatedAt = Date.parse(String(responder.location_updated_at || ''));
  const ageMs = now - updatedAt;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    || !Number.isFinite(updatedAt) || ageMs < -RESPONDER_FUTURE_TOLERANCE_MS || ageMs > RESPONDER_PRESENCE_TTL_MS) return null;
  return { latitude, longitude };
}

export function isLiveResponder(responder: LiveResponderRecord | null | undefined, now = Date.now()) {
  return liveResponderCoordinate(responder, now) !== null;
}
