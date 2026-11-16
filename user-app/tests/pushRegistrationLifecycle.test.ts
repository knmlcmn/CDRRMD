import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createSessionScopedSingleFlight } from '../src/utils/sessionScopedSingleFlight.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('push token listener converts the supplied device token without recursively fetching it', async () => {
  const push = await readFile(resolve(root, 'src/services/pushNotifications.ts'), 'utf8');
  const listener = push.slice(push.indexOf('export function subscribeToPushTokenChanges'));
  assert.match(listener, /addPushTokenListener\(\(devicePushToken\)/);
  assert.match(listener, /registerResidentPushNotifications\(scope, devicePushToken\)/);
  assert.doesNotMatch(listener, /registerResidentPushNotifications\(\)\s*\.catch/);
  assert.match(push, /getExpoPushTokenAsync\(\{[\s\S]*?devicePushToken/);
});

test('530 concurrent callbacks share one session-scoped registration flight', async () => {
  const gate = createSessionScopedSingleFlight<number>();
  let executions = 0;
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const requests = Array.from({ length: 530 }, () => gate.run(7, async () => {
    executions += 1;
    await blocked;
    return 42;
  }));
  assert.equal(executions, 0, 'the operation starts on the next microtask');
  await Promise.resolve();
  assert.equal(executions, 1);
  assert.ok(requests.every((request) => request === requests[0]));
  release();
  assert.deepEqual(await Promise.all(requests), Array(530).fill(42));

  const push = await readFile(resolve(root, 'src/services/pushNotifications.ts'), 'utf8');
  assert.match(push, /pushRegistrationFlight\.has\(scope\)/);
  assert.match(push, /pushRegistrationFlight\.run\(scope/);
  assert.match(push, /registeredSnapshot\?\.scope === scope && registeredSnapshot\.expoPushToken === expoPushToken/);
  assert.match(push, /queuedDevicePushToken = devicePushToken/);
  assert.match(push, /scope !== pushRegistrationGeneration/);
});

test('logout waits for in-flight registration and revokes only the ended resident scope', async () => {
  const push = await readFile(resolve(root, 'src/services/pushNotifications.ts'), 'utf8');
  const unregister = push.slice(
    push.indexOf('export function unregisterResidentPushNotifications'),
    push.indexOf('export function subscribeToPushTokenChanges'),
  );
  assert.match(unregister, /const endedScope = pushRegistrationGeneration/);
  assert.match(unregister, /if \(registrationToSettle\) await registrationToSettle\.catch/);
  assert.match(unregister, /registrationTokensByScope\.get\(endedScope\)/);
  assert.match(unregister, /headers: authorizationToken/);
  assert.match(unregister, /__skipAuthRefresh: true/);
});

test('resident auth failure uses the same scoped cleanup as explicit logout', async () => {
  const app = await readFile(resolve(root, 'App.tsx'), 'utf8');
  assert.match(app, /handleAuthFailureIfSessionActive\(sessionRef\.current, performLogout\)/);
});

test('SOS state changes cannot retrigger resident push registration', async () => {
  const app = await readFile(resolve(root, 'App.tsx'), 'utf8');
  const pushEffect = app.slice(
    app.indexOf('const pushSessionScope = beginResidentPushNotificationSession()') - 100,
    app.indexOf('const pushSessionScope = beginResidentPushNotificationSession()') + 500,
  );
  assert.match(pushEffect, /session\?\.user\.role !== 'user'/);
  assert.match(pushEffect, /\[session\?\.user\.id, session\?\.user\.role\]/);
  assert.doesNotMatch(pushEffect, /requestStarted|floodAlertRescueRequest|routingRecommendation/);
});
