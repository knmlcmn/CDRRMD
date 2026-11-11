export type WeatherSnapshotState<T> = {
  data: T | null;
  receivedAt: number | null;
  isFresh: boolean;
};

type WeatherSnapshotStoreOptions<T> = {
  freshnessTtlMs: number;
  now?: () => number;
  sourceTime?: (value: T) => number | null;
};

export function createWeatherSnapshotStore<T>(
  loader: () => Promise<T>,
  { freshnessTtlMs, now = Date.now, sourceTime = () => null }: WeatherSnapshotStoreOptions<T>,
) {
  let snapshot: { data: T; receivedAt: number; sourceTime: number | null } | null = null;
  let inFlight: Promise<T> | null = null;

  function read(): WeatherSnapshotState<T> {
    const age = snapshot ? Math.max(0, now() - snapshot.receivedAt) : Number.POSITIVE_INFINITY;
    return {
      data: snapshot?.data ?? null,
      receivedAt: snapshot?.receivedAt ?? null,
      isFresh: Boolean(snapshot && age < freshnessTtlMs),
    };
  }

  function load({ forceRefresh = false }: { forceRefresh?: boolean } = {}) {
    const current = read();
    if (!forceRefresh && current.data && current.isFresh) return Promise.resolve(current.data);
    if (inFlight) return inFlight;

    const request = loader().then((value) => {
      const candidateSourceTime = sourceTime(value);
      const currentSourceTime = snapshot?.sourceTime ?? null;
      const responseIsOlder = candidateSourceTime !== null && currentSourceTime !== null
        && candidateSourceTime < currentSourceTime;
      if (!responseIsOlder) {
        snapshot = { data: value, receivedAt: now(), sourceTime: candidateSourceTime };
      }
      return snapshot?.data ?? value;
    });
    const tracked = request.finally(() => {
      if (inFlight === tracked) inFlight = null;
    });
    inFlight = tracked;
    return tracked;
  }

  return { load, read };
}
