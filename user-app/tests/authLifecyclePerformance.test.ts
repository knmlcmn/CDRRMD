import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('logout transitions to login before background network cleanup settles', async () => {
  const app = await readFile(resolve(root, 'App.tsx'), 'utf8');
  const logout = app.slice(app.indexOf('function performLogout()'), app.indexOf('function requestLogout()'));
  assert.ok(logout.indexOf('setSession(null)') < logout.indexOf('Promise.allSettled'));
  assert.match(logout, /unregisterResidentPushNotifications\(previousSession\.token\)/);
  assert.doesNotMatch(logout, /await unregisterResidentPushNotifications/);
});

test('runtime authorization is revoked before native storage cleanup', async () => {
  const session = await readFile(resolve(root, 'src/services/session.ts'), 'utf8');
  const clear = session.slice(session.indexOf('export async function clearSession'), session.indexOf('export async function loadSession'));
  assert.ok(clear.indexOf('applyAuthorizationHeader?.(null)') < clear.indexOf('AsyncStorage.removeItem'));
  assert.match(session, /sessionStorageQueue/);
  assert.match(session, /enqueueSessionStorage/);
});

test('stale token refresh responses cannot resurrect a logged-out session', async () => {
  const api = await readFile(resolve(root, 'src/services/api.ts'), 'utf8');
  assert.match(api, /refreshGeneration !== authRequestGeneration/);
  assert.match(api, /isCurrentAuthRequest\(original\.__authRequestGeneration, authRequestGeneration\)/);
  assert.match(api, /refreshingGeneration === requestGeneration/);
  assert.match(api, /saveSession\(nextSession, \(\) => refreshGeneration === authRequestGeneration\)/);
  assert.match(api, /typeof authConfig\.__authRequestGeneration !== 'number'/);
  assert.doesNotMatch(api, /\(config as any\)\.__authRequestGeneration = authRequestGeneration/);
});

test('rescuer auth failures are scoped to the session that created the portal', async () => {
  const app = await readFile(resolve(root, 'App.tsx'), 'utf8');
  const portal = await readFile(resolve(root, 'src/rescuer/RescuerPortal.tsx'), 'utf8');
  assert.match(app, /handleAuthFailureForSession\(session, sessionRef\.current, performLogout\)/);
  assert.match(app, /handleAuthFailureIfSessionActive\(sessionRef\.current/);
  assert.match(portal, /if \(active && caught\?\.response\?\.status === 401\) onAuthError\(\)/);
});

test('production authentication does not silently retry the same configured host', async () => {
  const api = await readFile(resolve(root, 'src/services/api.ts'), 'utf8');
  const postAuth = api.slice(api.indexOf('export async function postAuth'), api.indexOf('export async function getAuthMe'));
  assert.match(postAuth, /if \(configuredApiBase\)[\s\S]*?throw error/);
  assert.match(api, /isConnectivityError\(error\) && !original\.__hostRetried && !configuredApiBase/);
});

test('push cleanup is serialized before another resident registration and rescuer sessions suppress resident alerts', async () => {
  const push = await readFile(resolve(root, 'src/services/pushNotifications.ts'), 'utf8');
  assert.match(push, /if \(pushCleanupPromise\) await pushCleanupPromise\.catch/);
  assert.match(push, /session\?\.user\?\.role === 'user'/);
  assert.match(push, /shouldShowBanner: residentSessionActive/);
  assert.match(push, /__skipAuthRefresh: true/);
  assert.match(push, /finally \{[\s\S]*?AsyncStorage\.removeItem\(PUSH_TOKEN_STORAGE_KEY\)/);
});

test('late resident location work cannot persist across a resident-to-rescuer switch', async () => {
  const app = await readFile(resolve(root, 'App.tsx'), 'utf8');
  const assign = app.slice(app.indexOf('async function assignLocationToSession'), app.indexOf('async function activateSession'));
  assert.match(assign, /if \(sessionRef\.current !== currentSession\) return/);
  assert.match(assign, /saveSession\(ensured\.session, \(\) => sessionRef\.current === currentSession\)/);
  assert.match(assign, /if \(!saved \|\| sessionRef\.current !== currentSession\) return/);
});

test('rescuer portal readiness does not wait for queued session persistence', async () => {
  const app = await readFile(resolve(root, 'App.tsx'), 'utf8');
  const authenticated = app.slice(app.indexOf('async function handleAuthenticated'), app.indexOf('function performLogout'));
  assert.match(authenticated, /setSession\(nextSession\)/);
  assert.match(authenticated, /void saveSession\(nextSession/);
  assert.doesNotMatch(authenticated, /await saveSession\(nextSession/);
  assert.match(app, /rescuer-session-ready-after-logout/);
  assert.match(app, /logout-session-storage-cleanup/);
  assert.match(app, /logout-resident-push-cleanup/);
});
