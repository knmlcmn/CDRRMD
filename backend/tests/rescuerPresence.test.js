const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const jwt = require('jsonwebtoken');

const {
  HEARTBEAT_TTL_SECONDS,
  LOCATION_TTL_SECONDS,
  hasBoundSessionSql,
  hasLiveLocationSql,
  isLiveResponder,
} = require('../src/utils/rescuerPresence');
const { hashRefreshToken, issueTokens } = require('../src/utils/authTokens');

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

test('access tokens are bound to their exact rotating refresh session', () => {
  const user = { id: 17, username: 'rescuer', role: 'rescuer', barangay_name: null };
  const first = issueTokens(user);
  const second = issueTokens(user);
  const firstAccess = jwt.decode(first.token);
  const secondAccess = jwt.decode(second.token);
  assert.equal(firstAccess.sessionHash, hashRefreshToken(first.refreshToken));
  assert.equal(secondAccess.sessionHash, hashRefreshToken(second.refreshToken));
  assert.notEqual(firstAccess.sessionHash, secondAccess.sessionHash);
});

test('heartbeat, GPS, and logout bind the access token to one non-revoked session', () => {
  const sql = hasBoundSessionSql('users', '$2');
  assert.match(sql, /presence_session\.token_hash = \$2::text/);
  assert.match(sql, /presence_session\.revoked_at IS NULL/);
  assert.match(sql, /presence_session\.expires_at > NOW\(\)/);

  const root = path.resolve(__dirname, '..');
  const rescuerController = fs.readFileSync(path.join(root, 'src/controllers/rescuerController.js'), 'utf8');
  const authController = fs.readFileSync(path.join(root, 'src/controllers/authController.js'), 'utf8');
  assert.match(rescuerController, /hasBoundSessionSql\('users', '\$2'\)/);
  assert.match(rescuerController, /hasBoundSessionSql\('users', '\$4'\)/);
  assert.match(authController, /sessionHash: req\.user\?\.sessionHash/);
});

test('refresh rotation and login serialize the single-active-session policy', () => {
  const root = path.resolve(__dirname, '..');
  const authSource = fs.readFileSync(path.join(root, 'src/services/authService.js'), 'utf8');
  const tokenModelSource = fs.readFileSync(path.join(root, 'src/models/refreshTokenModel.js'), 'utf8');
  assert.match(authSource, /SELECT id FROM users WHERE id = \$1 FOR UPDATE/);
  assert.match(authSource, /revokeActiveByUser\(client, user\.id\)/);
  assert.match(tokenModelSource, /LIMIT 1\s+FOR UPDATE/);
});

test('mobile retries an in-flight old access token after successful session rotation', () => {
  const apiSource = fs.readFileSync(
    path.resolve(__dirname, '../../user-app/src/services/api.ts'),
    'utf8',
  );
  assert.match(apiSource, /code === 'AUTH_SESSION_INVALID'/);
  assert.match(apiSource, /requestAuthorization !== currentAuthorization/);
  assert.match(apiSource, /original\.headers\.Authorization = currentAuthorization/);
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
    assert.match(source, /isLiveResponderAccount\(rescuer, presenceNow\)/, `${relativePath} must filter offline or stale responders`);
    assert.match(source, /liveResponderCoordinate\(liveResponder, presenceNow\)/, `${relativePath} must gate assigned responder location`);
  }
  const monitoring = fs.readFileSync(path.join(root, 'admin-web/src/pages/MonitoringPage.tsx'), 'utf8');
  assert.doesNotMatch(monitoring, /current_latitude \?\? selectedReport\?\.rescuer_latitude/);
});

test('all web live-responder map paths expire cached coordinates and clear failed feeds', () => {
  const root = path.resolve(__dirname, '../..');
  const helper = fs.readFileSync(path.join(root, 'admin-web/src/services/liveResponderPresence.ts'), 'utf8');
  const dashboard = fs.readFileSync(path.join(root, 'admin-web/src/pages/DashboardPage.tsx'), 'utf8');
  const monitoring = fs.readFileSync(path.join(root, 'admin-web/src/pages/MonitoringPage.tsx'), 'utf8');
  const barangayMonitoring = fs.readFileSync(path.join(root, 'admin-web/src/barangay/pages/MonitoringPage.tsx'), 'utf8');
  const mapHtml = fs.readFileSync(path.join(root, 'admin-web/src/utils/calambaMapHtml.ts'), 'utf8');

  assert.match(helper, /responder\?\.is_online === true/);
  assert.match(helper, /ageMs >= -RESPONDER_FUTURE_TOLERANCE_MS/);
  assert.match(helper, /ageMs <= RESPONDER_PRESENCE_TTL_MS/);
  assert.match(dashboard, /catch \(err: unknown\) \{\s+setCityRescuers\(\[\]\)/);
  assert.match(monitoring, /catch \(err: unknown\) \{\s+setCityRescuers\(\[\]\)/);
  assert.match(barangayMonitoring, /isLiveResponderAccount\(rescuer, presenceNow\)/);
  assert.match(barangayMonitoring, /hasFreshResponderCoordinates\(candidate, presenceNow\)/);
  assert.match(barangayMonitoring, /else \{\s+setReports\(\[\]\);/);
  assert.match(mapHtml, /responderFleetLayer\.clearLayers\(\)/);
  assert.match(mapHtml, /point\.isOnline !== true/);
  assert.match(mapHtml, /locationAgeMs < -5000 \|\| locationAgeMs > 45000/);
});

test('localhost builds never silently fall through to the production API', () => {
  const apiClient = fs.readFileSync(
    path.resolve(__dirname, '../../admin-web/src/services/apiClient.ts'),
    'utf8',
  );
  assert.match(apiClient, /\['localhost', '127\.0\.0\.1', '::1', '\[::1\]'\]\.includes\(window\.location\.hostname\)/);
  assert.match(apiClient, /import\.meta\.env\.PROD && !isLocalBrowser/);
});

test('portal-level GPS survives tab switching without duplicate screen-level tracking', () => {
  const root = path.resolve(__dirname, '../..');
  const portal = fs.readFileSync(path.join(root, 'user-app/src/rescuer/RescuerPortal.tsx'), 'utf8');
  const assignments = fs.readFileSync(path.join(root, 'user-app/src/rescuer/screens/AssignmentsScreen.tsx'), 'utf8');
  const hookIndex = portal.indexOf('useResponderLocationPresence(onAuthError)');
  const contentIndex = portal.indexOf('const content =');
  assert.ok(hookIndex > 0 && hookIndex < contentIndex, 'presence hook must remain mounted above tab content');
  assert.doesNotMatch(assignments, /watchLiveLocation|requireLiveLocation|updateResponderLocation/);
});

test('foreground-only GPS fails closed for background, denied permission, and stale fixes', () => {
  const root = path.resolve(__dirname, '../..');
  const hook = fs.readFileSync(path.join(root, 'user-app/src/rescuer/hooks/useResponderLocationPresence.ts'), 'utf8');
  const access = fs.readFileSync(path.join(root, 'user-app/src/services/locationAccess.ts'), 'utf8');
  assert.match(hook, /if \(state === 'active'\) startForeground\(false\);\s+else stopForeground\(\);/);
  assert.match(hook, /if \(!result\.ok\) \{\s+setLocation\(null\);/);
  assert.match(hook, /now - location\.capturedAt <= RESPONDER_LOCATION_MAX_AGE_MS/);
  assert.match(hook, /if \(Platform\.OS === 'web'\)/);
  assert.match(hook, /if \(!latestPublishedLocation \|\| !isFreshResponderLocation\(latestPublishedLocation\)\)/);
  assert.doesNotMatch(access, /maxAge:\s*120000/);
  assert.match(access, /timeInterval:\s*15000/);
  assert.match(access, /distanceInterval:\s*0/);
});

test('45-second server TTL has margin over 15-second heartbeat and GPS refresh intervals', () => {
  const root = path.resolve(__dirname, '../..');
  const portal = fs.readFileSync(path.join(root, 'user-app/src/rescuer/RescuerPortal.tsx'), 'utf8');
  const hook = fs.readFileSync(path.join(root, 'user-app/src/rescuer/hooks/useResponderLocationPresence.ts'), 'utf8');
  assert.match(portal, /setInterval\(\(\) => void heartbeat\(\), 15000\)/);
  assert.match(hook, /RESPONDER_LOCATION_REFRESH_MS = 15_000/);
  assert.ok(HEARTBEAT_TTL_SECONDS * 1000 >= 3 * 15_000);
  assert.ok(LOCATION_TTL_SECONDS * 1000 >= 3 * 15_000);
});
