const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const backendRoot = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(backendRoot, 'src/config/schemaMigrations.js'), 'utf8');
const initDb = fs.readFileSync(path.join(backendRoot, 'src/config/initDb.js'), 'utf8');
const rescuerController = fs.readFileSync(path.join(backendRoot, 'src/controllers/rescuerController.js'), 'utf8');
const { evacuationAreaStillHasCapacity, hasValidDestinationCoordinates } = require('../src/services/evacuationRoutingService');

test('migration 10 owns existing-database DDL and fails safely under lock pressure', () => {
  assert.match(migration, /version: 10/);
  assert.match(migration, /set_config\('statement_timeout'/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /set_config\('lock_timeout'/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS outside_normal_service_area/);
  assert.doesNotMatch(initDb, /ADD COLUMN IF NOT EXISTS outside_normal_service_area/);
  assert.doesNotMatch(initDb, /ADD COLUMN IF NOT EXISTS pickup_proximity_started_at/);
  assert.doesNotMatch(initDb, /incident_reports_immutable_rescue_location/);
  assert.match(initDb, /await runSchemaMigrations\(pool\)/);
});

test('destination coordinate validation rejects null, non-finite, out-of-range, and zero-substitution values', () => {
  assert.equal(hasValidDestinationCoordinates({ latitude: 14.2, longitude: 121.1 }), true);
  assert.equal(hasValidDestinationCoordinates({ latitude: null, longitude: 121.1 }), false);
  assert.equal(hasValidDestinationCoordinates({ latitude: 14.2, longitude: null }), false);
  assert.equal(hasValidDestinationCoordinates({ latitude: Number.NaN, longitude: 121.1 }), false);
  assert.equal(hasValidDestinationCoordinates({ latitude: 91, longitude: 121.1 }), false);
  assert.equal(hasValidDestinationCoordinates({ latitude: 14.2, longitude: 181 }), false);
  assert.equal(hasValidDestinationCoordinates({ latitude: 0, longitude: 0 }), false);
});

test('capacity revalidation fails closed when the database returns invalid coordinates', async () => {
  const client = {
    calls: 0,
    async query() {
      this.calls += 1;
      return this.calls === 1 ? { rows: [] } : { rows: [{ id: 7, latitude: null, longitude: null }] };
    },
  };
  const result = await evacuationAreaStillHasCapacity(client, 7, { barangayName: 'Palingon' });
  assert.equal(result, null);
});

test('pickup destination exceptions are audited without coordinates and deduplicated', () => {
  assert.match(rescuerController, /metadata->>'eventCode' = 'NO_VERIFIED_EVACUATION_DESTINATION'/);
  assert.match(rescuerController, /created_at >= NOW\(\) - INTERVAL '10 minutes'/);
  assert.match(rescuerController, /automaticPickupDeferred: true/);
  const auditBlock = rescuerController.slice(rescuerController.indexOf('NO_VERIFIED_EVACUATION_DESTINATION') - 1200, rescuerController.indexOf('NO_VERIFIED_EVACUATION_DESTINATION') + 1500);
  assert.doesNotMatch(auditBlock, /pickup_last_latitude|pickup_last_longitude|accuracyMeters/);
});
