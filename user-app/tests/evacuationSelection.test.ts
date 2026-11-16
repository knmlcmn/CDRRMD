import assert from 'node:assert/strict';
import test from 'node:test';
import { rankNearestEligibleEvacuationCenters } from '../src/services/evacuationSelection.ts';

const origin = { latitude: 14.2055, longitude: 121.0960 };
const area = (overrides: Partial<any> = {}) => ({
  id: '1', barangay: 'Canlubang', latitude: 14.206, longitude: 121.097,
  capacity: 100, evacuees: 10, status: 'available' as const, ...overrides,
});

test('shortlisting keeps only eligible centers and honors requested capacity', () => {
  const ranked = rankNearestEligibleEvacuationCenters(origin, [
    area({ id: 'full', status: 'full' }),
    area({ id: 'insufficient', capacity: 11, evacuees: 10 }),
    area({ id: 'eligible', capacity: 12, evacuees: 10 }),
  ], 2);
  assert.deepEqual(ranked.map((entry) => entry.area.id), ['eligible']);
});

test('shortlisting limits OSRM candidates by straight-line proximity', () => {
  const ranked = rankNearestEligibleEvacuationCenters(origin, [
    area({ id: 'far', latitude: 14.24 }),
    area({ id: 'near', latitude: 14.206 }),
    area({ id: 'middle', latitude: 14.215 }),
    area({ id: 'fourth', latitude: 14.22 }),
  ], 1, 3);
  assert.deepEqual(ranked.map((entry) => entry.area.id), ['near', 'middle', 'fourth']);
});

test('barangay filtering remains available for jurisdiction-specific selection', () => {
  const ranked = rankNearestEligibleEvacuationCenters(origin, [
    area({ id: 'outside', barangay: 'Mayapa' }),
    area({ id: 'inside' }),
  ], 1, 3, 'Barangay Canlubang');
  assert.deepEqual(ranked.map((entry) => entry.area.id), ['inside']);
});
