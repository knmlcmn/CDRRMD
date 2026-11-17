const assert = require('node:assert/strict');
const test = require('node:test');

const { REQUIRED_SAMPLES, evaluatePickupObservation } = require('../src/services/pickupInferenceService');

const now = Date.parse('2026-11-17T02:00:40.000Z');
const acknowledgedAt = '2026-11-17T02:00:00.000Z';

test('one nearby reading never infers pickup', () => {
  const result = evaluatePickupObservation({ nowMs: now, capturedAt: '2026-11-17T02:00:10.000Z', accuracyMeters: 12, distanceMeters: 20, acknowledgedAt });
  assert.equal(result.accepted, true);
  assert.equal(result.qualified, false);
  assert.equal(result.proximitySampleCount, 1);
});

test('stale, inaccurate, pre-acknowledgement, and replayed samples are rejected', () => {
  const base = { nowMs: now, distanceMeters: 15, acknowledgedAt };
  assert.equal(evaluatePickupObservation({ ...base, capturedAt: now - 60_000, accuracyMeters: 10 }).accepted, false);
  assert.equal(evaluatePickupObservation({ ...base, capturedAt: now, accuracyMeters: 75 }).accepted, false);
  assert.equal(evaluatePickupObservation({ ...base, capturedAt: '2026-11-17T01:59:59.000Z', accuracyMeters: 10 }).accepted, false);
  assert.equal(evaluatePickupObservation({ ...base, capturedAt: now, previousObservedAt: new Date(now), accuracyMeters: 10 }).accepted, false);
});

test('sustained accurate proximity qualifies only after multiple spaced samples', () => {
  const firstAt = '2026-11-17T02:00:10.000Z';
  const secondAt = '2026-11-17T02:00:25.000Z';
  const thirdAt = '2026-11-17T02:00:40.000Z';
  const second = evaluatePickupObservation({ nowMs: now, capturedAt: secondAt, accuracyMeters: 10, distanceMeters: 25, acknowledgedAt, previousObservedAt: firstAt, proximityStartedAt: firstAt, proximitySampleCount: 1 });
  assert.equal(second.qualified, false);
  const third = evaluatePickupObservation({ nowMs: now, capturedAt: thirdAt, accuracyMeters: 10, distanceMeters: 25, acknowledgedAt, previousObservedAt: secondAt, proximityStartedAt: firstAt, proximitySampleCount: 2 });
  assert.equal(third.proximitySampleCount, REQUIRED_SAMPLES);
  assert.equal(third.qualified, true);
});

test('leaving proximity resets accumulated confidence', () => {
  const result = evaluatePickupObservation({ nowMs: now, capturedAt: now, accuracyMeters: 10, distanceMeters: 100, acknowledgedAt, proximityStartedAt: '2026-11-17T02:00:10.000Z', proximitySampleCount: 2 });
  assert.equal(result.accepted, true);
  assert.equal(result.qualified, false);
  assert.equal(result.proximitySampleCount, 0);
});
