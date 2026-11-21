export type RescueGpsObservation = {
  latitude: number;
  longitude: number;
  capturedAt?: number | null;
  accuracyMeters?: number | null;
};

export type RescueGpsValidation =
  | { ok: true; capturedAtAdvisory: number | null; accuracyMetersAdvisory: number | null }
  | { ok: false; code: 'INVALID_COORDINATES' };

export function validateRescueGpsObservation(
  observation: RescueGpsObservation,
): RescueGpsValidation {
  const { latitude, longitude, capturedAt, accuracyMeters } = observation;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { ok: false, code: 'INVALID_COORDINATES' };
  }
  const capturedAtAdvisory = typeof capturedAt === 'number' && Number.isFinite(capturedAt)
    ? capturedAt
    : null;
  const accuracyMetersAdvisory = typeof accuracyMeters === 'number'
    && Number.isFinite(accuracyMeters)
    && accuracyMeters >= 0
    ? accuracyMeters
    : null;
  return {
    ok: true,
    capturedAtAdvisory,
    accuracyMetersAdvisory,
  };
}
