const assert = require('node:assert/strict');
const test = require('node:test');

const { findNearestAvailableEvacuationArea } = require('../src/services/evacuationRoutingService');

function routingClient(rows) {
  return {
    queries: [],
    async query(sql, parameters) {
      this.queries.push({ sql, parameters });
      if (/pg_advisory_xact_lock/.test(sql)) return { rows: [] };
      return { rows };
    },
  };
}

function osrmResponse(distances, durations) {
  return {
    ok: true,
    async json() {
      return {
        code: 'Ok',
        sources: [{ distance: 5 }],
        destinations: distances.map(() => ({ distance: 5 })),
        distances: [distances],
        durations: [durations],
      };
    },
  };
}

test('verified road distance may select a supported cross-barangay center', async (context) => {
  const originalFetch = global.fetch;
  context.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => osrmResponse([2400, 900], [600, 240]);
  const client = routingClient([
    { id: 1, name: 'Local Center', barangay: 'Palingon', latitude: 14.21, longitude: 121.18, capacity: 50, total_evacuees: 2 },
    { id: 2, name: 'Cross Center', barangay: 'Lingga', latitude: 14.20, longitude: 121.17, capacity: 50, total_evacuees: 2 },
    { id: 3, name: 'Unsupported Center', barangay: 'San Jose', latitude: 14.20, longitude: 121.16, capacity: 50, total_evacuees: 2 },
  ]);

  const area = await findNearestAvailableEvacuationArea(client, 14.214, 121.186, {
    barangayName: 'Palingon',
    allowOtherBarangays: true,
  });

  assert.equal(area.id, 2);
  assert.equal(client.queries.length, 2);
  assert.doesNotMatch(client.queries[1].sql, /LOWER\(ea\.barangay\) = LOWER/);
});

test('cross-barangay routing returns unavailable when OSRM verifies no route', async (context) => {
  const originalFetch = global.fetch;
  context.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => osrmResponse([null], [null]);
  const client = routingClient([
    { id: 2, name: 'Cross Center', barangay: 'Lingga', latitude: 14.20, longitude: 121.17, capacity: 50, total_evacuees: 2 },
  ]);

  const area = await findNearestAvailableEvacuationArea(client, 14.214, 121.186, {
    barangayName: 'Palingon',
    allowOtherBarangays: true,
  });

  assert.equal(area, null);
});
