import type { LiveLocation } from '../../services/locationAccess';

export const RESPONDER_LOCATION_REFRESH_MS = 15_000;
export const RESPONDER_LOCATION_MAX_AGE_MS = 30_000;

export function isFreshResponderLocation(location: LiveLocation, now = Date.now()) {
  return Number.isFinite(location.latitude)
    && location.latitude >= -90 && location.latitude <= 90
    && Number.isFinite(location.longitude)
    && location.longitude >= -180 && location.longitude <= 180
    && Number.isFinite(location.capturedAt)
    && now >= location.capturedAt
    && now - location.capturedAt <= RESPONDER_LOCATION_MAX_AGE_MS;
}
