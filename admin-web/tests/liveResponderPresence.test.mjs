import assert from 'node:assert/strict';
import test from 'node:test';

import { liveResponderCoordinate } from '../src/services/liveResponderPresence.ts';

const now = Date.parse('2026-11-16T04:00:00.000Z');
const live = {
  is_online: true,
  current_latitude: 14.22,
  current_longitude: 121.18,
  location_updated_at: new Date(now - 10_000).toISOString(),
};

test('frontend accepts only fresh online valid coordinates', () => {
  assert.deepEqual(liveResponderCoordinate(live, now), { latitude: 14.22, longitude: 121.18 });
  assert.equal(liveResponderCoordinate({ ...live, is_online: false }, now), null);
  assert.equal(liveResponderCoordinate({ ...live, location_updated_at: new Date(now - 45_001).toISOString() }, now), null);
  assert.equal(liveResponderCoordinate({ ...live, current_latitude: 91 }, now), null);
});
