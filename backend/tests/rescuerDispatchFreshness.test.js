const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { findNearestAvailableRescuer } = require('../src/services/rescuerDispatchService');
const controller = fs.readFileSync(path.join(__dirname, '../src/controllers/rescuerController.js'), 'utf8');

test('supplied responder capture time remains authoritative for location freshness', () => {
  assert.match(controller, /locationObservedAt = hasCapturedAt[\s\S]*new Date\(capturedAtMs\)[\s\S]*new Date\(0\)/);
  assert.match(controller, /location_updated_at = COALESCE\(\$4::timestamptz, NOW\(\)\)/);
  assert.match(controller, /\[latitude, longitude, req\.user\.userId, locationObservedAt\]/);
});

test('dispatch proximity uses responder GPS only while the location timestamp is live', async () => {
  let dispatchSql = '';
  const client = {
    async query(sql) {
      dispatchSql = sql;
      return { rows: [] };
    },
  };

  await findNearestAvailableRescuer(client, {
    dispatchType: 'barangay_responder',
    barangayName: 'Sampiruhan',
    latitude: 14.215,
    longitude: 121.19,
  });

  assert.match(dispatchSql, /location_updated_at BETWEEN NOW\(\) - INTERVAL '45 seconds' AND NOW\(\) \+ INTERVAL '5 seconds'/);
  assert.match(dispatchSql, /CASE WHEN[\s\S]*location_updated_at[\s\S]*THEN u\.current_latitude END, bb\.centroid_lat/);
  assert.match(dispatchSql, /CASE WHEN[\s\S]*location_updated_at[\s\S]*THEN u\.current_longitude END, bb\.centroid_lon/);
  assert.doesNotMatch(dispatchSql, /COALESCE\(u\.current_(?:latitude|longitude)/);
});
