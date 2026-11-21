const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const backendRoot = path.resolve(__dirname, '..');
const controller = fs.readFileSync(path.join(backendRoot, 'src/controllers/rescuerController.js'), 'utf8');
const dispatchService = fs.readFileSync(path.join(backendRoot, 'src/services/rescuerDispatchService.js'), 'utf8');
const dbConfig = fs.readFileSync(path.join(backendRoot, 'src/config/db.js'), 'utf8');

test('responder location updates preserve atomic transitions with verified supported routing', () => {
  assert.match(controller, /await client\.query\('BEGIN'\)/);
  assert.match(controller, /FOR UPDATE OF br, ir/);
  assert.match(controller, /WHERE id = \$4 AND status = 'accepted'/);
  assert.match(controller, /evaluatePickupObservation/);
  assert.doesNotMatch(controller, /incidentDistanceMeters <= 50/);
  assert.match(controller, /allowOtherBarangays: true/);
  assert.match(controller, /await client\.query\('COMMIT'\)/);
  assert.match(controller, /await client\.query\('ROLLBACK'\)/);
});

test('heartbeat and location endpoints both refresh responder presence', () => {
  assert.match(controller, /SET is_active = TRUE, last_seen_at = NOW\(\)/);
  assert.match(controller, /location_updated_at = COALESCE\(\$4::timestamptz, NOW\(\)\), last_seen_at = NOW\(\), is_active = TRUE/);
  assert.match(dispatchService, /last_seen_at >= NOW\(\) - INTERVAL '45 seconds'/);
});

test('production pool limits remain deployment-configurable and bounded on Vercel', () => {
  assert.match(dbConfig, /process\.env\.DB_POOL_MAX \|\| \(process\.env\.VERCEL \? 2 : 10\)/);
  assert.match(dbConfig, /idleTimeoutMillis: Number\(process\.env\.DB_IDLE_TIMEOUT_MS \|\| 30000\)/);
  assert.match(dbConfig, /connectionTimeoutMillis: Number\(process\.env\.DB_CONNECT_TIMEOUT_MS \|\| 5000\)/);
});
