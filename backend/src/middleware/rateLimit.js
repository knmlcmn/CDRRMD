const { runWithRedis } = require('../config/redis');

const memoryWindows = new Map();

function cleanupMemory(now) {
  if (memoryWindows.size < 2_000) return;
  for (const [key, entry] of memoryWindows) {
    if (entry.resetAt <= now) memoryWindows.delete(key);
  }
}

async function incrementRedis(key, windowMs) {
  const script = `
    local count = redis.call('INCR', KEYS[1])
    if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
    return { count, redis.call('PTTL', KEYS[1]) }
  `;
  return runWithRedis((redis) => redis.eval(script, {
    keys: [key],
    arguments: [String(windowMs)],
  }));
}

function incrementMemory(key, windowMs) {
  const now = Date.now();
  cleanupMemory(now);
  const current = memoryWindows.get(key);
  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    memoryWindows.set(key, next);
    return [next.count, windowMs];
  }
  current.count += 1;
  return [current.count, Math.max(0, current.resetAt - now)];
}

function rateLimit({ namespace, limit, windowMs, skip, keyGenerator } = {}) {
  return async function redisRateLimit(req, res, next) {
    if (skip?.(req)) return next();
    const identity = keyGenerator?.(req) || req.user?.userId || req.ip || req.socket.remoteAddress || 'unknown';
    const windowId = Math.floor(Date.now() / windowMs);
    const key = `cdrrmd:rate:${namespace}:${identity}:${windowId}`;

    const localResult = incrementMemory(key, windowMs);
    const redisResult = await incrementRedis(key, windowMs);
    const hasRedis = Array.isArray(redisResult);
    const count = Math.max(Number(localResult[0]) || 0, hasRedis ? Number(redisResult[0]) || 0 : 0);
    const ttl = Math.max(0, hasRedis ? Number(redisResult[1]) || windowMs : Number(localResult[1]) || windowMs);
    const source = hasRedis ? 'redis+memory' : 'memory';

    res.set('RateLimit-Limit', String(limit));
    res.set('RateLimit-Remaining', String(Math.max(0, limit - count)));
    res.set('RateLimit-Reset', String(Math.ceil((Date.now() + ttl) / 1000)));
    res.set('X-RateLimit-Source', source);

    if (count > limit) {
      res.set('Retry-After', String(Math.max(1, Math.ceil(ttl / 1000))));
      return res.status(429).json({
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please retry shortly.',
      });
    }
    return next();
  };
}

module.exports = rateLimit;
