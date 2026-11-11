import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  createAssignmentScreenRequestScope,
  shouldRefreshAssignmentHistory,
} from '../src/rescuer/utils/assignmentHistoryPolicy.ts';

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    backup_request_id: 1,
    status: 'accepted',
    responder_acknowledged_at: null,
    picked_up_at: null,
    evacuation_area_id: 3,
    ...overrides,
  };
}

test('weekly history refresh policy ignores only newly arriving active work', () => {
  const existing = assignment();
  assert.equal(shouldRefreshAssignmentHistory(null, [existing]), false);
  assert.equal(shouldRefreshAssignmentHistory([existing], [existing, assignment({ backup_request_id: 2 })]), false);
});

test('acceptance, pickup, status, destination, completion, and cancellation changes refresh history', () => {
  const existing = assignment();
  assert.equal(shouldRefreshAssignmentHistory([existing], [assignment({ responder_acknowledged_at: '2026-11-06T10:00:00Z' })]), true);
  assert.equal(shouldRefreshAssignmentHistory([existing], [assignment({ picked_up_at: '2026-11-06T10:05:00Z' })]), true);
  assert.equal(shouldRefreshAssignmentHistory([existing], [assignment({ status: 'in_progress' })]), true);
  assert.equal(shouldRefreshAssignmentHistory([existing], [assignment({ evacuation_area_id: 4 })]), true);
  assert.equal(shouldRefreshAssignmentHistory([existing], []), true);
});

test('request scope rejects responses after blur, logout, or a new screen session', () => {
  const scope = createAssignmentScreenRequestScope();
  scope.activate();
  const firstSession = scope.capture();
  assert.equal(scope.isCurrent(firstSession), true);
  scope.invalidate();
  assert.equal(scope.isCurrent(firstSession), false);
  scope.activate();
  const nextSession = scope.capture();
  assert.equal(scope.isCurrent(firstSession), false);
  assert.equal(scope.isCurrent(nextSession), true);
});

test('AssignmentsScreen polls only active assignments every five seconds', async () => {
  const screen = await readFile(
    resolve(dirname(fileURLToPath(import.meta.url)), '../src/rescuer/screens/AssignmentsScreen.tsx'),
    'utf8',
  );

  assert.match(screen, /setInterval\(\(\) => void refreshActive\(\), 5000\)/);
  assert.equal(screen.match(/loadWeeklyHistory\(\)/g)?.length, 1);
  assert.match(screen, /historyRequestRef\.current/);
  assert.match(screen, /activeRequestRef\.current/);
  assert.match(screen, /clearInterval\(timer\)/);
  assert.match(screen, /appStateSubscription\.remove\(\)/);
});

test('history refreshes on focus, manual refresh, resume, acknowledgement, and pickup', async () => {
  const screen = await readFile(
    resolve(dirname(fileURLToPath(import.meta.url)), '../src/rescuer/screens/AssignmentsScreen.tsx'),
    'utf8',
  );

  assert.match(screen, /requestScope\.activate\(\)[\s\S]*?void refreshAll\(true\)/);
  assert.match(screen, /AppState\.addEventListener\('change'[\s\S]*?void refreshAll\(true\)/);
  assert.match(screen, /onRefresh=\{\(\) => \{ setLoading\(true\); void refreshAll\(true\); \}\}/);
  assert.match(screen, /await acknowledgeAssignment[\s\S]*?await refreshAll\(true\)/);
  assert.match(screen, /if \(data\.pickupConfirmed\) void refreshAll\(true\)/);
  assert.match(screen, /requestScope\.invalidate\(\)/);
});

test('GPS and OSRM routing thresholds remain unchanged by assignment polling work', async () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
  const [screen, locationAccess] = await Promise.all([
    readFile(resolve(root, 'rescuer/screens/AssignmentsScreen.tsx'), 'utf8'),
    readFile(resolve(root, 'services/locationAccess.ts'), 'utf8'),
  ]);
  assert.match(screen, /fetchRoadRoute\(location, destination, true, 1, controller\.signal\)/);
  assert.match(screen, /watchLiveLocation\(\(nextLocation\)/);
  assert.match(locationAccess, /timeInterval: 5000/);
  assert.match(locationAccess, /distanceInterval: 3/);
});
