const MAX_RESCUE_LOCATION_AGE_MS = 45_000;
const MAX_RESCUE_LOCATION_FUTURE_SKEW_MS = 10_000;
const MAX_RESCUE_LOCATION_ACCURACY_METERS = 50;

function parseTimestamp(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function validateRescueLocationObservation({
  latitude,
  longitude,
  capturedAt,
  accuracyMeters,
  nowMs = Date.now(),
}) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90
    || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    return { ok: false, status: 400, code: 'INVALID_RESCUE_GPS', message: 'Valid GPS coordinates are required.' };
  }

  if (capturedAt === null || capturedAt === undefined || capturedAt === ''
    || accuracyMeters === null || accuracyMeters === undefined || accuracyMeters === '') {
    return {
      ok: false,
      status: 426,
      code: 'RESCUE_GPS_METADATA_REQUIRED',
      message: 'Update the app before creating a rescue request. Fresh GPS timestamp and accuracy are required.',
    };
  }

  const observedAtMs = parseTimestamp(capturedAt);
  const accuracy = Number(accuracyMeters);
  if (!Number.isFinite(observedAtMs)
    || observedAtMs < nowMs - MAX_RESCUE_LOCATION_AGE_MS
    || observedAtMs > nowMs + MAX_RESCUE_LOCATION_FUTURE_SKEW_MS) {
    return { ok: false, status: 422, code: 'STALE_RESCUE_GPS', message: 'A fresh GPS fix is required before creating a rescue request.' };
  }
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > MAX_RESCUE_LOCATION_ACCURACY_METERS) {
    return { ok: false, status: 422, code: 'INACCURATE_RESCUE_GPS', message: 'GPS accuracy of 50 meters or better is required before creating a rescue request.' };
  }

  return { ok: true, latitude: lat, longitude: lon, capturedAt: new Date(observedAtMs), accuracyMeters: accuracy };
}

module.exports = {
  MAX_RESCUE_LOCATION_ACCURACY_METERS,
  MAX_RESCUE_LOCATION_AGE_MS,
  validateRescueLocationObservation,
};
