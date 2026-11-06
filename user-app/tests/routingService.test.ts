import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchBestRoadRoute, fetchRoadRoute } from '../src/services/routingService.ts';

const originalFetch = globalThis.fetch;

test('best-road selection still uses the shortest reachable OSRM table distance', async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      return {
        ok: true,
        json: async () => ({
          code: 'Ok',
          distances: [[5_000, 2_000]],
          durations: [[600, 300]],
          sources: [{ distance: 0 }],
          destinations: [{ distance: 0 }, { distance: 0 }],
        }),
      } as Response;
    }
    return {
      ok: true,
      json: async () => ({
        routes: [{
          distance: 2_000,
          duration: 300,
          geometry: { coordinates: [[121.1, 14.2], [121.2, 14.3]] },
        }],
        waypoints: [{ distance: 0 }, { distance: 0 }],
      }),
    } as Response;
  }) as typeof fetch;

  try {
    const result = await fetchBestRoadRoute(
      { latitude: 14.2, longitude: 121.1 },
      [
        { id: 'farther', latitude: 14.4, longitude: 121.4 },
        { id: 'nearer', latitude: 14.3, longitude: 121.2 },
      ],
      3,
    );
    assert.equal(result?.destinationId, 'nearer');
    assert.equal(result?.distanceKm, 2);
    assert.equal(result?.etaMinutes, 5);
    assert.equal(calls, 2, 'one table request and one selected-route request are expected');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('an obsolete route request aborts its OSRM fetch', async () => {
  let receivedSignal: AbortSignal | undefined;
  globalThis.fetch = ((_url, init) => new Promise<Response>((_resolve, reject) => {
    receivedSignal = init?.signal as AbortSignal | undefined;
    receivedSignal?.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  })) as typeof fetch;

  try {
    const controller = new AbortController();
    const request = fetchRoadRoute(
      { latitude: 14.2, longitude: 121.1 },
      { latitude: 14.3, longitude: 121.2 },
      true,
      3,
      controller.signal,
    );
    await Promise.resolve();
    controller.abort();
    await assert.rejects(request, (error: Error) => error.name === 'AbortError');
    assert.equal(receivedSignal?.aborted, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
