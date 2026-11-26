const assert = require('node:assert/strict');
const test = require('node:test');

const populationData = require('../src/services/populationDataService');

test('population updates are atomic, preserve land area, audit the administrator, and invalidate the read cache', async () => {
  const queries = [];
  const removedKeys = [];
  const client = {
    async query(sql, params) {
      const text = String(sql);
      queries.push({ text, params });
      if (/SELECT pr\.barangay_id/.test(text)) return { rowCount: 1, rows: [{ barangay_id: 4 }] };
      if (/SELECT b\.name AS barangay/.test(text)) return { rowCount: 1, rows: [{ barangay: 'Palingon', population: 7000, households: 1800 }] };
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  const result = await populationData.updatePopulationRecord('Palingon', {
      population: 7000,
      households: 1800,
      dataYear: 2026,
      dataSource: 'CDRRMD survey',
    }, 91, {
      pool: { connect: async () => client },
      cache: { remove: async (...keys) => { removedKeys.push(...keys); } },
    });
  const update = queries.find((entry) => /UPDATE barangay_population_records/.test(entry.text));
  assert.deepEqual(update.params, [7000, 1800, 2026, 'CDRRMD survey', 91, 4]);
  assert.doesNotMatch(update.text, /land_area_hectares\s*=/);
  assert.equal(queries.some((entry) => entry.text === 'COMMIT'), true);
  assert.deepEqual(removedKeys, [populationData.CACHE_KEY]);
  assert.equal(result.densityIsDerived, true);
});

test('a failed population update rolls back and leaves the cache untouched', async () => {
  const statements = [];
  let cacheInvalidated = false;
  const client = {
    async query(sql) {
      const text = String(sql);
      statements.push(text);
      if (/SELECT pr\.barangay_id/.test(text)) return { rowCount: 1, rows: [{ barangay_id: 4 }] };
      if (/UPDATE barangay_population_records/.test(text)) throw new Error('simulated database failure');
      return { rowCount: 0, rows: [] };
    },
    release() {},
  };
  await assert.rejects(
      populationData.updatePopulationRecord('Palingon', {
        population: 7000,
        households: 1800,
        dataYear: 2026,
        dataSource: 'CDRRMD survey',
      }, 91, {
        pool: { connect: async () => client },
        cache: { remove: async () => { cacheInvalidated = true; } },
      }),
      /simulated database failure/,
  );
  assert.equal(statements.includes('ROLLBACK'), true);
  assert.equal(statements.includes('COMMIT'), false);
  assert.equal(cacheInvalidated, false);
});
