const assert = require('node:assert/strict');
const test = require('node:test');

const {
  listVisibleLiveRescuers,
} = require('../src/services/rescuerPresenceService');

const now = Date.parse('2026-11-16T04:00:00.000Z');

function responder(overrides = {}) {
  return {
    id: 1,
    rescuer_id: 'BRS-2026-00001',
    first_name: 'Sample',
    last_name: 'Rescuer',
    barangay_name: 'Sampiruhan',
    role: 'barangay_rescuer',
    current_latitude: 14.22,
    current_longitude: 121.18,
    location_updated_at: new Date(now - 10_000).toISOString(),
    last_seen_at: new Date(now - 10_000).toISOString(),
    is_active: true,
    is_available: true,
    ...overrides,
  };
}

function adminQuery(rows) {
  return async (_sql, params) => {
    assert.deepEqual(params, [null]);
    return { rows };
  };
}

function barangayQuery(rows, barangayName = 'Sampiruhan') {
  let call = 0;
  return async (_sql, params) => {
    call += 1;
    if (call === 1) {
      assert.deepEqual(params, [77]);
      return { rows: [{ barangay_name: barangayName }] };
    }
    assert.deepEqual(params, [barangayName]);
    return { rows };
  };
}

test('zero online rescuers returns zero live markers', async () => {
  const result = await listVisibleLiveRescuers({ role: 'admin', userId: 1 }, { query: adminQuery([]), now });
  assert.deepEqual(result, []);
});

test('stale heartbeat is hidden', async () => {
  const stale = responder({ last_seen_at: new Date(now - 45_001).toISOString() });
  const result = await listVisibleLiveRescuers({ role: 'admin', userId: 1 }, { query: adminQuery([stale]), now });
  assert.deepEqual(result, []);
});

test('fresh heartbeat with valid GPS is shown', async () => {
  const result = await listVisibleLiveRescuers({ role: 'admin', userId: 1 }, { query: adminQuery([responder()]), now });
  assert.equal(result.length, 1);
  assert.equal(result[0].is_online, true);
  assert.equal(result[0].current_latitude, 14.22);
});

test('invalid GPS fails closed', async () => {
  const invalid = responder({ current_latitude: 91 });
  const result = await listVisibleLiveRescuers({ role: 'admin', userId: 1 }, { query: adminQuery([invalid]), now });
  assert.deepEqual(result, []);
});

test('Sampiruhan account sees Sampiruhan rescuers only', async () => {
  const rows = [
    responder({ id: 1, barangay_name: 'Sampiruhan' }),
    responder({ id: 2, barangay_name: 'Lingga' }),
  ];
  const result = await listVisibleLiveRescuers(
    { role: 'barangay', userId: 77, barangayName: 'Lingga' },
    { query: barangayQuery(rows), now },
  );
  assert.deepEqual(result.map((item) => item.barangay_name), ['Sampiruhan']);
});

test('other barangay rescuer data is excluded from the response', async () => {
  const otherBarangay = responder({ id: 2, barangay_name: 'Lingga', current_latitude: 14.99 });
  const result = await listVisibleLiveRescuers(
    { role: 'barangay', userId: 77 },
    { query: barangayQuery([otherBarangay]), now },
  );
  assert.deepEqual(result, []);
});

test('CDRRMD Admin sees all eligible online rescuers citywide', async () => {
  const rows = [
    responder({ id: 1, barangay_name: 'Sampiruhan' }),
    responder({ id: 2, barangay_name: 'Lingga' }),
    responder({ id: 3, role: 'rescuer', barangay_name: null }),
  ];
  const result = await listVisibleLiveRescuers({ role: 'admin', userId: 9 }, { query: adminQuery(rows), now });
  assert.deepEqual(result.map((item) => item.id), [1, 2, 3]);
});

test('missing authenticated barangay scope fails closed', async () => {
  const query = barangayQuery([], '');
  await assert.rejects(
    listVisibleLiveRescuers({ role: 'barangay', userId: 77 }, { query, now }),
    (error) => error?.status === 403,
  );
});
