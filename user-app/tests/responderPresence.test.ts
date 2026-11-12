import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  isFreshResponderLocation,
  RESPONDER_LOCATION_MAX_AGE_MS,
  RESPONDER_LOCATION_REFRESH_MS,
} from '../src/rescuer/utils/responderPresencePolicy.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('freshness policy accepts only valid coordinates captured within 30 seconds', () => {
  const now = Date.parse('2026-11-12T03:00:00.000Z');
  const fresh = { latitude: 14.2, longitude: 121.1, capturedAt: now - 30_000 };
  assert.equal(RESPONDER_LOCATION_MAX_AGE_MS, 30_000);
  assert.equal(RESPONDER_LOCATION_REFRESH_MS, 15_000);
  assert.equal(isFreshResponderLocation(fresh, now), true);
  assert.equal(isFreshResponderLocation({ ...fresh, capturedAt: now - 30_001 }, now), false);
  assert.equal(isFreshResponderLocation({ ...fresh, capturedAt: now + 1 }, now), false);
  assert.equal(isFreshResponderLocation({ ...fresh, latitude: 91 }, now), false);
  assert.equal(isFreshResponderLocation({ ...fresh, longitude: -181 }, now), false);
});

test('portal-level presence survives all four tabs without replacing v10 navigation or pill behavior', async () => {
  const [portal, tabs] = await Promise.all([
    readFile(resolve(root, 'src/rescuer/RescuerPortal.tsx'), 'utf8'),
    readFile(resolve(root, 'src/rescuer/utils/rescuerTabBar.ts'), 'utf8'),
  ]);
  const hookIndex = portal.indexOf('useResponderLocationPresence(onAuthError)');
  const contentIndex = portal.indexOf('const content =');
  assert.ok(hookIndex > 0 && hookIndex < contentIndex);
  assert.match(portal, /subscribeToWaterLevelSensors/);
  assert.match(portal, /RESCUER_TAB_INDICATOR/);
  assert.match(portal, /getRescuerTabItems\(tab\)/);
  assert.match(tabs, /assignments[\s\S]*history[\s\S]*flood[\s\S]*account/);
});

test('background, denied, stale, and failed publication paths clear visible presence', async () => {
  const hook = await readFile(resolve(root, 'src/rescuer/hooks/useResponderLocationPresence.ts'), 'utf8');
  assert.match(hook, /if \(state === 'active'\) startForeground\(false\);\s+else stopForeground\(\);/);
  assert.match(hook, /function stopForeground\(\)[\s\S]*?watcher\?\.remove\(\)[\s\S]*?setLocation\(null\)/);
  assert.match(hook, /if \(!result\.ok\) \{\s+setLocation\(null\);\s+setLocationError\(result\.message\)/);
  assert.match(hook, /if \(!isFreshResponderLocation\(nextLocation\)\) \{\s+setLocation\(null\)/);
  assert.match(hook, /catch \(caught: any\) \{[\s\S]*?setLocation\(null\)/);
});

test('location acquisition carries capture time and never falls back to two-minute GPS', async () => {
  const access = await readFile(resolve(root, 'src/services/locationAccess.ts'), 'utf8');
  assert.match(access, /capturedAt: position\.timestamp/);
  assert.doesNotMatch(access, /maxAge:\s*120000/);
  assert.match(access, /maxAge:\s*30_000/);
  assert.match(access, /timeInterval:\s*15000/);
  assert.match(access, /distanceInterval:\s*0/);
});
