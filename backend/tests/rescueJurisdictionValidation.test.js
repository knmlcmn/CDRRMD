const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { resolveRescueJurisdiction } = require('../src/services/rescueJurisdictionService');

test('Test Mode OFF accepts a point inside a supported polygon', () => {
  const result = resolveRescueJurisdiction(14.214, 121.186, false);
  assert.equal(result.handlingBarangay, 'Palingon');
  assert.equal(result.outsideNormalServiceArea, false);
  assert.equal(result.selectionMethod, 'containing-polygon');
});

test('Test Mode ON uses the same containing polygon for an in-area request', () => {
  const result = resolveRescueJurisdiction(14.214, 121.186, true);
  assert.equal(result.handlingBarangay, 'Palingon');
  assert.equal(result.outsideNormalServiceArea, false);
  assert.equal(result.selectionMethod, 'containing-polygon');
});

test('Test Mode OFF blocks a point outside every supported polygon', () => {
  assert.equal(resolveRescueJurisdiction(14.6, 121.5, false), null);
});

test('Test Mode ON selects the nearest supported polygon boundary without a registered-barangay fallback', () => {
  const result = resolveRescueJurisdiction(14.6, 121.5, true);
  assert.equal(result.handlingBarangay, 'Looc');
  assert.equal(result.outsideNormalServiceArea, true);
  assert.equal(result.selectionMethod, 'nearest-polygon-boundary');
  assert.ok(result.distanceToBoundaryKm > 0);

  const source = fs.readFileSync(path.join(__dirname, '../src/services/rescueJurisdictionService.js'), 'utf8');
  assert.doesNotMatch(source, /registered|userBarangay|barangay_name/);
});

test('report creation persists server jurisdiction, immutable submitted GPS, and outside-area audit state', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/controllers/reportController.js'), 'utf8');
  assert.match(source, /const jurisdiction = resolveRescueJurisdiction\(lat, lon, geographicalBypassEnabled\)/);
  assert.match(source, /const serviceAreaBarangay = jurisdiction\.handlingBarangay/);
  assert.match(source, /outside_normal_service_area/);
  assert.match(source, /handlingBarangaySelection: jurisdiction\.selectionMethod/);
  assert.match(source, /locationText,\s*lat,\s*lon,\s*assignedBarangay/);
  assert.doesNotMatch(source, /SET\s+latitude\s*=/);
  assert.doesNotMatch(source, /SET\s+longitude\s*=/);
  const migration = fs.readFileSync(path.join(__dirname, '../src/config/schemaMigrations.js'), 'utf8');
  assert.match(migration, /incident_reports_immutable_rescue_location/);
  assert.match(migration, /Reported rescue coordinates are immutable/);
});
