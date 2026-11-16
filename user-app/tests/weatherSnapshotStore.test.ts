import assert from 'node:assert/strict';
import test from 'node:test';
import { createWeatherSnapshotStore } from '../src/utils/weatherSnapshotStore.ts';

type Forecast = { current: { time: string; temperature_2m: number } };
const forecast = (time: string, temperature: number): Forecast => ({
  current: { time, temperature_2m: temperature },
});
const sourceTime = (value: Forecast) => Date.parse(value.current.time);

test('fresh weather reads and concurrent callers share one network load', async () => {
  let calls = 0;
  let resolveLoader!: (value: Forecast) => void;
  const pending = new Promise<Forecast>((resolve) => { resolveLoader = resolve; });
  const store = createWeatherSnapshotStore(() => {
    calls += 1;
    return pending;
  }, { freshnessTtlMs: 30_000, sourceTime });

  const first = store.load();
  const second = store.load();
  assert.strictEqual(second, first);
  resolveLoader(forecast('2026-11-09T10:00:00Z', 29));
  await first;
  assert.equal((await store.load()).current.temperature_2m, 29);
  assert.equal(calls, 1);
});

test('failed or older refreshes preserve the last authoritative weather snapshot', async () => {
  let now = 1_000;
  let call = 0;
  const responses = [
    forecast('2026-11-09T11:00:00Z', 31),
    forecast('2026-11-09T10:00:00Z', 27),
  ];
  const store = createWeatherSnapshotStore(async () => {
    call += 1;
    if (call === 2) throw new Error('offline');
    return responses.shift() as Forecast;
  }, { freshnessTtlMs: 30_000, now: () => now, sourceTime });

  const newest = await store.load();
  now += 30_001;
  await assert.rejects(store.load(), /offline/);
  assert.strictEqual(store.read().data, newest);
  const afterOlderResponse = await store.load();
  assert.strictEqual(afterOlderResponse, newest);
});
