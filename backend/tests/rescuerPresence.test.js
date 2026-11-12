const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  HEARTBEAT_TTL_SECONDS,
  LOCATION_TTL_SECONDS,
  hasLiveLocationSql,
  isLiveResponder,
} = require('../src/utils/rescuerPresence');

const now = Date.parse('2026-11-12T04:00:00.000Z');

function liveRecord(overrides = {}) {
  return {
    role: 'rescuer',
    isArchived: false,
    isActive: true,
    hasValidSession: true,
    lastSeenAt: new Date(now - 10_000).toISOString(),
    locationUpdatedAt: new Date(now - 10_000).toISOString(),
    latitude: 14.2117,
    longitude: 121.1653,
    ...overrides,
  };
}

test('both CDRRMD and Barangay responders require a valid live session and fresh GPS', () => {
  assert.equal(isLiveResponder(liveRecord({ role: 'rescuer' }), now), true);
  assert.equal(isLiveResponder(liveRecord({ role: 'barangay_rescuer' }), now), true);
  assert.equal(isLiveResponder(liveRecord({ role: 'admin' }), now), false);
});

test('logout or server-side session invalidation hides an otherwise fresh responder', () => {
  assert.equal(isLiveResponder(liveRecord({ isActive: false }), now), false);
  assert.equal(isLiveResponder(liveRecord({ hasValidSession: false }), now), false);
});

test('app closure and network loss fail closed after the heartbeat TTL', () => {
  const expiredHeartbeat = new Date(now - (HEARTBEAT_TTL_SECONDS * 1000) - 1).toISOString();
  assert.equal(isLiveResponder(liveRecord({ lastSeenAt: expiredHeartbeat }), now), false);
});

test('stale GPS and offline-but-available records cannot become live markers', () => {
  const staleLocation = new Date(now - (LOCATION_TTL_SECONDS * 1000) - 1).toISOString();
  assert.equal(isLiveResponder(liveRecord({ locationUpdatedAt: staleLocation }), now), false);
  assert.equal(isLiveResponder(liveRecord({ isActive: false, availability: 'Available' }), now), false);
  assert.equal(isLiveResponder(liveRecord({ latitude: null, longitude: null }), now), false);
});

test('active assignments do not affect presence and remain eligible for Busy rendering', () => {
  assert.equal(isLiveResponder(liveRecord({ hasActiveAssignment: true }), now), true);
});

test('server SQL gates historical coordinates on role, archive, session, heartbeat, and GPS freshness', () => {
  const sql = hasLiveLocationSql('responder');
  assert.match(sql, /responder\.role IN \('rescuer', 'barangay_rescuer'\)/);
  assert.match(sql, /responder\.is_archived/);
  assert.match(sql, /user_refresh_tokens/);
  assert.match(sql, /responder\.last_seen_at/);
  assert.match(sql, /responder\.location_updated_at/);
});

test('automatic dispatch uses the same fail-closed live-location policy', () => {
  const dispatchSource = fs.readFileSync(
    path.resolve(__dirname, '../src/services/rescuerDispatchService.js'),
    'utf8',
  );
  assert.match(dispatchSource, /hasLiveLocationSql\('u'\)/);
  assert.doesNotMatch(dispatchSource, /u\.last_seen_at >= NOW\(\) - INTERVAL '45 seconds'/);
});

test('Admin Dashboard and Incident Monitoring both enforce online gating and avoid report-coordinate fallback', () => {
  const root = path.resolve(__dirname, '../..');
  for (const relativePath of ['admin-web/src/pages/DashboardPage.tsx', 'admin-web/src/pages/MonitoringPage.tsx']) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    assert.match(source, /\.filter\(\(rescuer\) => rescuer\.is_online\)/, `${relativePath} must filter offline responders`);
    assert.match(source, /cityRescuers\.find\(\(rescuer\) => rescuer\.is_online/, `${relativePath} must gate assigned responder location`);
  }
  const monitoring = fs.readFileSync(path.join(root, 'admin-web/src/pages/MonitoringPage.tsx'), 'utf8');
  assert.doesNotMatch(monitoring, /current_latitude \?\? selectedReport\?\.rescuer_latitude/);
});
