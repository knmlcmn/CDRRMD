function parseTimestamp(value) {
  if (value === null || value === undefined || value === '') return Number.NaN;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseAccuracy(value) {
  if (value === null || value === undefined || value === '') return Number.NaN;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : Number.NaN;
}

function validateRescueLocationObservation({
  latitude,
  longitude,
  capturedAt,
  accuracyMeters,
}) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90
    || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    return { ok: false, status: 400, code: 'INVALID_RESCUE_GPS', message: 'Valid GPS coordinates are required.' };
  }

  const observedAtMs = parseTimestamp(capturedAt);
  const accuracy = parseAccuracy(accuracyMeters);
  return {
    ok: true,
    latitude: lat,
    longitude: lon,
    // Capture time and accuracy describe the observation but do not decide
    // whether a resident may ask for rescue. Older clients may omit them and
    // weak fixes must remain visibly uncertain rather than being rejected or
    // represented as verified.
    capturedAt: Number.isFinite(observedAtMs) ? new Date(observedAtMs) : null,
    accuracyMeters: Number.isFinite(accuracy) ? accuracy : null,
  };
}

module.exports = {
  validateRescueLocationObservation,
};
