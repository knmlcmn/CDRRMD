const assert = require('node:assert/strict');
const test = require('node:test');

const {
  validateRescueLocationObservation,
} = require('../src/services/rescueLocationValidationService');

const nowMs = Date.parse('2026-11-17T04:00:00.000Z');

test('fresh accurate rescue GPS is accepted', () => {
  const result = validateRescueLocationObservation({ latitude: 14.214, longitude: 121.186, capturedAt: nowMs - 5_000, accuracyMeters: 18, nowMs });
  assert.equal(result.ok, true);
  assert.equal(result.accuracyMeters, 18);
});

test('legacy rescue clients without timestamp or accuracy fail with an explicit update requirement', () => {
  const result = validateRescueLocationObservation({ latitude: 14.214, longitude: 121.186, nowMs });
  assert.equal(result.ok, false);
  assert.equal(result.status, 426);
  assert.equal(result.code, 'RESCUE_GPS_METADATA_REQUIRED');
});

test('stale, future, inaccurate, and invalid rescue GPS fail closed', () => {
  assert.equal(validateRescueLocationObservation({ latitude: 14.214, longitude: 121.186, capturedAt: nowMs - 60_000, accuracyMeters: 10, nowMs }).code, 'STALE_RESCUE_GPS');
  assert.equal(validateRescueLocationObservation({ latitude: 14.214, longitude: 121.186, capturedAt: nowMs + 20_000, accuracyMeters: 10, nowMs }).code, 'STALE_RESCUE_GPS');
  assert.equal(validateRescueLocationObservation({ latitude: 14.214, longitude: 121.186, capturedAt: nowMs, accuracyMeters: 51, nowMs }).code, 'INACCURATE_RESCUE_GPS');
  assert.equal(validateRescueLocationObservation({ latitude: 100, longitude: 121.186, capturedAt: nowMs, accuracyMeters: 10, nowMs }).code, 'INVALID_RESCUE_GPS');
});
