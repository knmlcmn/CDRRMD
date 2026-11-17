const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const backendRoot = path.resolve(__dirname, '..');
const reportController = fs.readFileSync(path.join(backendRoot, 'src/controllers/reportController.js'), 'utf8');
const routingService = fs.readFileSync(path.join(backendRoot, 'src/services/evacuationRoutingService.js'), 'utf8');
const backupRoutes = fs.readFileSync(path.join(backendRoot, 'src/routes/backupRoutes.js'), 'utf8');
const evacuationController = fs.readFileSync(path.join(backendRoot, 'src/controllers/evacuationCenterController.js'), 'utf8');
const rescuerController = fs.readFileSync(path.join(backendRoot, 'src/controllers/rescuerController.js'), 'utf8');

test('only authenticated residents can create rescue reports', () => {
  assert.match(reportController, /req\.user\?\.role !== 'user'/);
  assert.match(reportController, /Resident account access required/);
});

test('evacuation selection evaluates every eligible same-barangay center', () => {
  assert.match(routingService, /LOWER\(ea\.barangay\) = LOWER/);
  assert.match(routingService, /candidateRows\.map/);
  assert.doesNotMatch(routingService, /LIMIT 3/);
  assert.doesNotMatch(rescuerController, /allowOtherBarangays/);
  assert.doesNotMatch(reportController, /allowOtherBarangays/);
});

test('dispatch acknowledgement is restricted to the assigned responder', () => {
  assert.match(backupRoutes, /Number\(dispatch\.assigned_rescuer_id\) !== actor\.id/);
  assert.match(backupRoutes, /This dispatch is assigned to another responder/);
  assert.match(backupRoutes, /responder_acknowledged_at = NOW\(\)/);
  assert.doesNotMatch(backupRoutes, /status = 'in_progress'.*responder_acknowledged/s);
});

test('final resolution is an owned-center barangay arrival action after inferred pickup', () => {
  assert.match(evacuationController, /req\.user\?\.role !== 'barangay'/);
  assert.match(evacuationController, /LOWER\(barangay\) = LOWER\(\$2\)/);
  assert.match(evacuationController, /picked_up_at IS NOT NULL/);
  assert.match(evacuationController, /SET status = 'resolved'/);
});
