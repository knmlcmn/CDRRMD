const cache = require('../services/cacheService');

function cacheResponse({ key, ttlMs, staleMs = 0 }) {
  return async function cachedResponse(req, res, next) {
    if (req.method !== 'GET' || req.headers.authorization && req.headers['cache-control'] === 'no-cache') {
      return next();
    }

    const cacheKey = typeof key === 'function' ? key(req) : key;
    try {
      const cached = await cache.read(cacheKey);
      if (cached) {
        res.set('X-Cache', cached.state === 'fresh' ? 'HIT' : 'STALE');
        return res.json(cached.value);
      }
    } catch {
      // A cache failure must never make the API unavailable.
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.write(cacheKey, body, ttlMs, staleMs).catch(() => {});
      }
      res.set('X-Cache', 'MISS');
      return originalJson(body);
    };
    return next();
  };
}

module.exports = cacheResponse;
