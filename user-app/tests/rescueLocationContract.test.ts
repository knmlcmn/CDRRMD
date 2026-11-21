import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRescueGpsObservation } from '../src/services/rescueLocationContract.ts';

const now = 1_800_000_000_000;
const valid = {
  latitude: 14.2128,
  longitude: 121.1671,
  capturedAt: now,
  accuracyMeters: 20,
};

test('accepts coordinates and preserves usable advisory metadata', () => {
  assert.deepEqual(validateRescueGpsObservation(valid), {
    ok: true,
    capturedAtAdvisory: now,
    accuracyMetersAdvisory: 20,
  });
});

test('accepts weak, stale, future, or missing advisory metadata', () => {
  assert.deepEqual(validateRescueGpsObservation({ ...valid, capturedAt: now - 600_000, accuracyMeters: 500 }), {
    ok: true,
    capturedAtAdvisory: now - 600_000,
    accuracyMetersAdvisory: 500,
  });
  assert.deepEqual(validateRescueGpsObservation({
    ...valid,
    capturedAt: now + 600_000,
    accuracyMeters: 75,
  }), {
    ok: true,
    capturedAtAdvisory: now + 600_000,
    accuracyMetersAdvisory: 75,
  });
  assert.deepEqual(validateRescueGpsObservation({ ...valid, capturedAt: null, accuracyMeters: null }), {
    ok: true,
    capturedAtAdvisory: null,
    accuracyMetersAdvisory: null,
  });
  assert.deepEqual(validateRescueGpsObservation({ ...valid, capturedAt: Number.NaN, accuracyMeters: -1 }), {
    ok: true,
    capturedAtAdvisory: null,
    accuracyMetersAdvisory: null,
  });
});

test('rejects invalid rescue coordinates before submission', () => {
  assert.deepEqual(validateRescueGpsObservation({ ...valid, latitude: 91 }), {
    ok: false,
    code: 'INVALID_COORDINATES',
  });
  assert.deepEqual(validateRescueGpsObservation({ ...valid, longitude: Number.NaN }), {
    ok: false,
    code: 'INVALID_COORDINATES',
  });
});
