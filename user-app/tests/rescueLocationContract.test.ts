import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLIENT_RESCUE_LOCATION_MAX_AGE_MS,
  CLIENT_RESCUE_LOCATION_MAX_FUTURE_SKEW_MS,
  RESCUE_LOCATION_MAX_ACCURACY_METERS,
  validateRescueGpsObservation,
} from '../src/services/rescueLocationContract.ts';

const now = 1_800_000_000_000;
const valid = {
  latitude: 14.2128,
  longitude: 121.1671,
  capturedAt: now,
  accuracyMeters: 20,
};

test('accepts a fresh rescue GPS observation at the accuracy boundary', () => {
  assert.deepEqual(validateRescueGpsObservation({
    ...valid,
    capturedAt: now - CLIENT_RESCUE_LOCATION_MAX_AGE_MS,
    accuracyMeters: RESCUE_LOCATION_MAX_ACCURACY_METERS,
  }, now), { ok: true });
});

test('rejects missing or inaccurate rescue GPS accuracy', () => {
  assert.deepEqual(validateRescueGpsObservation({ ...valid, accuracyMeters: null }, now), {
    ok: false,
    code: 'MISSING_ACCURACY',
  });
  assert.deepEqual(validateRescueGpsObservation({ ...valid, accuracyMeters: 50.01 }, now), {
    ok: false,
    code: 'INACCURATE',
  });
  assert.deepEqual(validateRescueGpsObservation({ ...valid, accuracyMeters: -1 }, now), {
    ok: false,
    code: 'INACCURATE',
  });
});

test('rejects stale, invalid, or implausibly future rescue GPS timestamps', () => {
  assert.deepEqual(validateRescueGpsObservation({
    ...valid,
    capturedAt: now - CLIENT_RESCUE_LOCATION_MAX_AGE_MS - 1,
  }, now), { ok: false, code: 'STALE_TIMESTAMP' });
  assert.deepEqual(validateRescueGpsObservation({
    ...valid,
    capturedAt: now + CLIENT_RESCUE_LOCATION_MAX_FUTURE_SKEW_MS + 1,
  }, now), { ok: false, code: 'STALE_TIMESTAMP' });
  assert.deepEqual(validateRescueGpsObservation({ ...valid, capturedAt: Number.NaN }, now), {
    ok: false,
    code: 'STALE_TIMESTAMP',
  });
});

test('rejects invalid rescue coordinates before submission', () => {
  assert.deepEqual(validateRescueGpsObservation({ ...valid, latitude: 91 }, now), {
    ok: false,
    code: 'INVALID_COORDINATES',
  });
  assert.deepEqual(validateRescueGpsObservation({ ...valid, longitude: Number.NaN }, now), {
    ok: false,
    code: 'INVALID_COORDINATES',
  });
});
