import assert from 'node:assert/strict';
import test from 'node:test';
import { distanceMeters, shouldRefreshRoute } from '../src/services/routeRefreshPolicy.ts';

const origin = { latitude: 14.2117, longitude: 121.1653 };

test('route refresh is immediate for a new assignment or rescue-state key', () => {
  assert.equal(shouldRefreshRoute({
    previous: { key: 'assignment:1:pending', location: origin, refreshedAt: 1_000 },
    key: 'assignment:2:pending',
    location: origin,
    now: 1_100,
  }), true);
});

test('small recent GPS movement does not recalculate a route', () => {
  const nearby = { latitude: origin.latitude + 0.00002, longitude: origin.longitude };
  assert.ok(distanceMeters(origin, nearby) < 25);
  assert.equal(shouldRefreshRoute({
    previous: { key: 'assignment:1:pending', location: origin, refreshedAt: 1_000 },
    key: 'assignment:1:pending',
    location: nearby,
    now: 5_000,
  }), false);
});

test('meaningful movement or maximum age refreshes a route', () => {
  const moved = { latitude: origin.latitude + 0.0003, longitude: origin.longitude };
  const previous = { key: 'assignment:1:pending', location: origin, refreshedAt: 1_000 };
  assert.ok(distanceMeters(origin, moved) >= 25);
  assert.equal(shouldRefreshRoute({ previous, key: previous.key, location: moved, now: 2_000 }), true);
  assert.equal(shouldRefreshRoute({ previous, key: previous.key, location: origin, now: 31_000 }), true);
});
