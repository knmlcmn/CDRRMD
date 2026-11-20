export type RescueGpsObservation = {
  latitude: number;
  longitude: number;
  capturedAt: number;
  accuracyMeters?: number | null;
};

export type RescueGpsValidation =
  | { ok: true }
  | { ok: false; code: 'INVALID_COORDINATES' | 'MISSING_ACCURACY' | 'STALE_TIMESTAMP' | 'INACCURATE' };

// Keep a 15-second client buffer inside the backend's 45-second limit so a
// valid fix remains fresh while routing and the HTTP request begin.
export const CLIENT_RESCUE_LOCATION_MAX_AGE_MS = 30_000;
export const CLIENT_RESCUE_LOCATION_MAX_FUTURE_SKEW_MS = 10_000;
export const RESCUE_LOCATION_MAX_ACCURACY_METERS = 50;

export function validateRescueGpsObservation(
  observation: RescueGpsObservation,
  nowMs = Date.now(),
): RescueGpsValidation {
  const { latitude, longitude, capturedAt, accuracyMeters } = observation;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { ok: false, code: 'INVALID_COORDINATES' };
  }
  if (accuracyMeters === null || accuracyMeters === undefined || !Number.isFinite(accuracyMeters)) {
    return { ok: false, code: 'MISSING_ACCURACY' };
  }
  if (!Number.isFinite(capturedAt)
    || capturedAt < nowMs - CLIENT_RESCUE_LOCATION_MAX_AGE_MS
    || capturedAt > nowMs + CLIENT_RESCUE_LOCATION_MAX_FUTURE_SKEW_MS) {
    return { ok: false, code: 'STALE_TIMESTAMP' };
  }
  if (accuracyMeters < 0 || accuracyMeters > RESCUE_LOCATION_MAX_ACCURACY_METERS) {
    return { ok: false, code: 'INACCURATE' };
  }
  return { ok: true };
}
