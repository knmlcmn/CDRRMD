import assert from 'node:assert/strict';
import test from 'node:test';
import { createSingleFlight } from '../src/utils/singleFlight.ts';

test('overlapping callers share one in-flight request', async () => {
  const singleFlight = createSingleFlight<number>();
  let loads = 0;
  let resolveLoad: ((value: number) => void) | null = null;
  const load = () => {
    loads += 1;
    return new Promise<number>((resolve) => { resolveLoad = resolve; });
  };

  const first = singleFlight.run(load);
  const second = singleFlight.run(load);
  assert.equal(first, second);
  assert.equal(loads, 0, 'the loader starts in a microtask');
  await Promise.resolve();
  assert.equal(loads, 1);

  (resolveLoad as ((value: number) => void) | null)?.(42);
  assert.equal(await first, 42);
  assert.equal(await second, 42);
});

test('a settled request does not suppress the next refresh', async () => {
  const singleFlight = createSingleFlight<number>();
  let loads = 0;
  assert.equal(await singleFlight.run(async () => ++loads), 1);
  assert.equal(await singleFlight.run(async () => ++loads), 2);
});

test('a failed request does not suppress recovery', async () => {
  const singleFlight = createSingleFlight<number>();
  let loads = 0;
  await assert.rejects(singleFlight.run(async () => {
    loads += 1;
    throw new Error('temporary failure');
  }), /temporary failure/);
  assert.equal(await singleFlight.run(async () => ++loads), 2);
});
