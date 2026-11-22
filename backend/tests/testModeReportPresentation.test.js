const assert = require('node:assert/strict');
const test = require('node:test');
const { buildReportPresentation } = require('../src/services/testModeReportPresentation');

test('test-mode rescue presentation is unmistakably labeled for authorized responders', () => {
  const result = buildReportPresentation({
    incidentType: 'Request Rescue',
    details: 'Selected evacuation area: Test Center.',
    testModeEnabled: true,
  });
  assert.equal(result.incidentType, '[TEST MODE] Request Rescue');
  assert.match(result.details, /^\[TEST MODE\] Synthetic workflow test\./);
  assert.match(result.details, /submitted GPS coordinates/);
});

test('normal rescue presentation remains unchanged when Test Mode is off', () => {
  const result = buildReportPresentation({
    incidentType: 'Request Rescue',
    details: 'Resident needs assistance.',
    testModeEnabled: false,
  });
  assert.deepEqual(result, {
    incidentType: 'Request Rescue',
    details: 'Resident needs assistance.',
  });
});
