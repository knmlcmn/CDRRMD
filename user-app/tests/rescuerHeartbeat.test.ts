import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createHeartbeatDispatcher } from '../src/rescuer/services/heartbeatDispatcher.ts';

test('overlapping heartbeat triggers share one foreground request', async () => {
  let sends = 0;
  let finish: ((value: number) => void) | null = null;
  const dispatcher = createHeartbeatDispatcher(
    () => {
      sends += 1;
      return new Promise<number>((resolveRequest) => { finish = resolveRequest; });
    },
    () => true,
  );

  const interval = dispatcher.trigger();
  const resume = dispatcher.trigger();
  assert.equal(interval, resume);
  await Promise.resolve();
  assert.equal(sends, 1);

  (finish as ((value: number) => void) | null)?.(200);
  assert.equal(await interval, 200);
  assert.equal(await resume, 200);
});

test('rapid background to foreground transition suppresses background and duplicate resume sends', async () => {
  let foreground = false;
  let sends = 0;
  let finish: (() => void) | null = null;
  const dispatcher = createHeartbeatDispatcher(
    () => {
      sends += 1;
      return new Promise<void>((resolveRequest) => { finish = resolveRequest; });
    },
    () => foreground,
  );

  assert.equal(await dispatcher.trigger(), null);
  assert.equal(sends, 0);

  foreground = true;
  const overdueInterval = dispatcher.trigger();
  const appStateResume = dispatcher.trigger();
  await Promise.resolve();
  assert.equal(sends, 1);
  assert.equal(overdueInterval, appStateResume);

  (finish as (() => void) | null)?.();
  await overdueInterval;

  const nextInterval = dispatcher.trigger();
  await Promise.resolve();
  (finish as (() => void) | null)?.();
  await nextInterval;
  assert.equal(sends, 2, 'normal cadence resumes after the shared request settles');
});

test('a foreground trigger that is deferred until background never reaches the network', async () => {
  let foreground = true;
  let sends = 0;
  const dispatcher = createHeartbeatDispatcher(
    async () => { sends += 1; },
    () => foreground,
  );

  const heartbeat = dispatcher.trigger();
  foreground = false;
  assert.equal(await heartbeat, null);
  assert.equal(sends, 0);
});

test('portal keeps mount, 15-second interval, and resume triggers behind the shared dispatcher', async () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const [portal, service] = await Promise.all([
    readFile(resolve(root, 'src/rescuer/RescuerPortal.tsx'), 'utf8'),
    readFile(resolve(root, 'src/rescuer/services/rescuerService.ts'), 'utf8'),
  ]);

  assert.match(portal, /void heartbeat\(\);[\s\S]*?setInterval\(\(\) => void heartbeat\(\), 15000\)/);
  assert.match(portal, /AppState\.addEventListener\('change'[\s\S]*?state === 'active'[\s\S]*?heartbeat\(\)/);
  assert.match(portal, /AppState\.currentState !== 'active'/);
  assert.match(service, /createHeartbeatDispatcher/);
  assert.match(service, /AppState\.currentState === 'active'/);
  assert.match(service, /heartbeatDispatcher\.trigger\(\)/);
});
