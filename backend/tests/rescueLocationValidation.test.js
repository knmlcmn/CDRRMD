const assert = require('node:assert/strict');
const test = require('node:test');

const {
  validateRescueLocationObservation,
} = require('../src/services/rescueLocationValidationService');

const nowMs = Date.parse('2026-11-17T04:00:00.000Z');

test('valid rescue coordinates preserve advisory capture metadata', () => {
  const result = validateRescueLocationObservation({ latitude: 14.214, longitude: 121.186, capturedAt: nowMs - 5_000, accuracyMeters: 18, nowMs });
  assert.equal(result.ok, true);
  assert.equal(result.accuracyMeters, 18);
  assert.equal(result.capturedAt.toISOString(), '2026-11-17T03:59:55.000Z');
});

test('legacy rescue clients without timestamp or accuracy remain compatible', () => {
  const result = validateRescueLocationObservation({ latitude: 14.214, longitude: 121.186, nowMs });
  assert.equal(result.ok, true);
  assert.equal(result.capturedAt, null);
  assert.equal(result.accuracyMeters, null);
});

test('stale, future, and weak GPS metadata are advisory rather than rejection rules', () => {
  assert.equal(validateRescueLocationObservation({ latitude: 14.214, longitude: 121.186, capturedAt: nowMs - 600_000, accuracyMeters: 500, nowMs }).ok, true);
  assert.equal(validateRescueLocationObservation({ latitude: 14.214, longitude: 121.186, capturedAt: nowMs + 600_000, accuracyMeters: 75, nowMs }).ok, true);
  assert.equal(validateRescueLocationObservation({ latitude: 14.214, longitude: 121.186, capturedAt: 'unknown', accuracyMeters: -1, nowMs }).ok, true);
});

test('missing or invalid coordinates still fail closed', () => {
  assert.equal(validateRescueLocationObservation({ latitude: 100, longitude: 121.186, capturedAt: nowMs, accuracyMeters: 10, nowMs }).code, 'INVALID_RESCUE_GPS');
  assert.equal(validateRescueLocationObservation({ latitude: Number.NaN, longitude: 121.186 }).code, 'INVALID_RESCUE_GPS');
  assert.equal(validateRescueLocationObservation({ latitude: 14.214, longitude: Number.NaN }).code, 'INVALID_RESCUE_GPS');
});
