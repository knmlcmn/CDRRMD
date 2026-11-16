import assert from 'node:assert/strict';
import test from 'node:test';
import { createSharedPoller } from '../src/utils/sharedPoller.ts';

test('multiple subscribers share one polling interval and one in-flight request', async () => {
  let intervalStarts = 0;
  let intervalStops = 0;
  let loads = 0;
  let scheduled: (() => void) | null = null;
  let resolveLoad: ((value: number[]) => void) | null = null;
  const load = () => {
    loads += 1;
    return new Promise<number[]>((resolve) => { resolveLoad = resolve; });
  };
  const poller = createSharedPoller({
    load,
    signature: (value) => value.join(','),
    intervalMs: 3_000,
    setIntervalFn: (callback) => {
      intervalStarts += 1;
      scheduled = callback;
      return 1 as unknown as ReturnType<typeof setInterval>;
    },
    clearIntervalFn: () => { intervalStops += 1; },
  });

  const receivedA: number[][] = [];
  const receivedB: number[][] = [];
  const unsubscribeA = poller.subscribe((value) => receivedA.push(value));
  const unsubscribeB = poller.subscribe((value) => receivedB.push(value));
  assert.equal(intervalStarts, 1);
  assert.equal(loads, 1);
  assert.equal(poller.diagnostics().subscriberCount, 2);

  (scheduled as (() => void) | null)?.();
  assert.equal(loads, 1, 'a tick must reuse the in-flight request');
  (resolveLoad as ((value: number[]) => void) | null)?.([42]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(receivedA, [[42]]);
  assert.deepEqual(receivedB, [[42]]);

  unsubscribeA();
  assert.equal(intervalStops, 0);
  unsubscribeB();
  assert.equal(intervalStops, 1);
  assert.equal(poller.diagnostics().subscriberCount, 0);
});

test('unchanged values do not notify React consumers again', async () => {
  const values = [[10], [10], [11]];
  let index = 0;
  const poller = createSharedPoller({
    load: async () => values[index++],
    signature: (value) => value.join(','),
    intervalMs: 3_000,
    setIntervalFn: () => 1 as unknown as ReturnType<typeof setInterval>,
    clearIntervalFn: () => {},
  });
  const received: number[][] = [];
  const unsubscribe = poller.subscribe((value) => received.push(value));
  await new Promise((resolve) => setImmediate(resolve));
  await poller.refresh();
  await poller.refresh();
  assert.deepEqual(received, [[10], [11]]);
  unsubscribe();
});
