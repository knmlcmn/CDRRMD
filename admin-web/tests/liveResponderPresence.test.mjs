import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RESPONDER_PRESENCE_TTL_MS,
  RESPONDER_FUTURE_TOLERANCE_MS,
  hasFreshResponderCoordinates,
  isLiveResponderAccount,
  liveResponderCoordinate,
} from '../src/services/liveResponderPresence.ts';

const now = Date.parse('2026-11-12T04:00:00.000Z');

function responder(overrides = {}) {
  return {
    is_online: true,
    is_available: true,
    current_latitude: 14.2117,
    current_longitude: 121.1653,
    location_updated_at: new Date(now - 10_000).toISOString(),
    ...overrides,
  };
}

test('fresh online responders have a live coordinate', () => {
  assert.equal(isLiveResponderAccount(responder(), now), true);
  assert.deepEqual(liveResponderCoordinate(responder(), now), { latitude: 14.2117, longitude: 121.1653 });
  assert.equal(isLiveResponderAccount(responder({ is_available: false }), now), true, 'Busy is a dispatch state, not an offline state');
});

test('Available never overrides offline state', () => {
  assert.equal(isLiveResponderAccount(responder({ is_online: false, is_available: true }), now), false);
  assert.equal(isLiveResponderAccount(responder({ is_online: 'true' }), now), false);
});

test('persisted coordinates expire at the same 45-second boundary as the backend', () => {
  assert.equal(hasFreshResponderCoordinates(responder({
    location_updated_at: new Date(now - RESPONDER_PRESENCE_TTL_MS).toISOString(),
  }), now), true);
  assert.equal(hasFreshResponderCoordinates(responder({
    location_updated_at: new Date(now - RESPONDER_PRESENCE_TTL_MS - 1).toISOString(),
  }), now), false);
  assert.equal(hasFreshResponderCoordinates(responder({
    location_updated_at: new Date(now + RESPONDER_FUTURE_TOLERANCE_MS).toISOString(),
  }), now), true);
  assert.equal(hasFreshResponderCoordinates(responder({
    location_updated_at: new Date(now + RESPONDER_FUTURE_TOLERANCE_MS + 1).toISOString(),
  }), now), false);
});

test('missing, invalid, and out-of-range coordinates fail closed', () => {
  assert.equal(isLiveResponderAccount(responder({ current_latitude: null }), now), false);
  assert.equal(isLiveResponderAccount(responder({ current_longitude: '' }), now), false);
  assert.equal(isLiveResponderAccount(responder({ current_latitude: 91 }), now), false);
  assert.equal(isLiveResponderAccount(responder({ location_updated_at: null }), now), false);
});
