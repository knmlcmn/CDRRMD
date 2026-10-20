const { runWithRedis } = require('../config/redis');

const CACHE_PREFIX = String(process.env.CACHE_PREFIX || 'cdrrmd:v1');
const LOCAL_CACHE_MAX = Number(process.env.LOCAL_CACHE_MAX || 500);
const localCache = new Map();
const refreshPromises = new Map();

const stats = {
  localHits: 0,
  redisHits: 0,
  misses: 0,
  staleHits: 0,
  writes: 0,
  errors: 0,
};

function namespaced(key) {
  return `${CACHE_PREFIX}:${key}`;
}

function pruneLocalCache() {
  const now = Date.now();
  for (const [key, entry] of localCache) {
    if (entry.staleUntil <= now) localCache.delete(key);
  }
  while (localCache.size > LOCAL_CACHE_MAX) {
    localCache.delete(localCache.keys().next().value);
  }
}

function setLocal(key, envelope) {
  localCache.delete(key);
  localCache.set(key, envelope);
  pruneLocalCache();
}

function classify(envelope) {
  if (!envelope || typeof envelope !== 'object') return null;
  const now = Date.now();
  if (Number(envelope.expiresAt) > now) return 'fresh';
  if (Number(envelope.staleUntil) > now) return 'stale';
  return null;
}

async function read(key) {
  const fullKey = namespaced(key);
  const local = localCache.get(fullKey);
  const localState = classify(local);
  if (localState) {
    if (localState === 'fresh') stats.localHits += 1;
    else stats.staleHits += 1;
    return { state: localState, value: local.value };
  }
  if (local) localCache.delete(fullKey);

  const raw = await runWithRedis((redis) => redis.get(fullKey));
  if (!raw) {
    stats.misses += 1;
    return null;
  }

  try {
    const envelope = JSON.parse(raw);
    const state = classify(envelope);
    if (!state) {
      stats.misses += 1;
      return null;
    }
    setLocal(fullKey, envelope);
    if (state === 'fresh') stats.redisHits += 1;
    else stats.staleHits += 1;
    return { state, value: envelope.value };
  } catch {
    stats.errors += 1;
    return null;
  }
}

async function write(key, value, ttlMs, staleMs = 0) {
  const now = Date.now();
  const envelope = {
    value,
    expiresAt: now + ttlMs,
    staleUntil: now + ttlMs + staleMs,
  };
  const fullKey = namespaced(key);
  setLocal(fullKey, envelope);
  stats.writes += 1;
  const redisTtl = Math.max(1, ttlMs + staleMs);
  await runWithRedis((redis) => redis.pSetEx(fullKey, redisTtl, JSON.stringify(envelope)));
  return value;
}

async function remove(...keys) {
  const fullKeys = keys.flat().filter(Boolean).map(namespaced);
  fullKeys.forEach((key) => localCache.delete(key));
  if (fullKeys.length) await runWithRedis((redis) => redis.del(fullKeys));
}

async function getOrLoad(key, { ttlMs, staleMs = 0 }, loader) {
  const cached = await read(key);
  if (cached?.state === 'fresh') return { value: cached.value, cache: 'HIT' };

  const refresh = () => {
    if (!refreshPromises.has(key)) {
      const promise = Promise.resolve()
        .then(loader)
        .then((value) => write(key, value, ttlMs, staleMs))
        .finally(() => refreshPromises.delete(key));
      refreshPromises.set(key, promise);
    }
    return refreshPromises.get(key);
  };

  if (cached?.state === 'stale') {
    refresh().catch(() => { stats.errors += 1; });
    return { value: cached.value, cache: 'STALE' };
  }

  return { value: await refresh(), cache: 'MISS' };
}

function getCacheStats() {
  return { ...stats, localEntries: localCache.size, refreshes: refreshPromises.size };
}

module.exports = { getCacheStats, getOrLoad, read, remove, write };
