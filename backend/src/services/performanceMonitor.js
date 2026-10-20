const MAX_SAMPLES_PER_ROUTE = 1_000;
const routeStats = new Map();

function routeKey(req) {
  const normalized = String(req.route?.path || req.path || req.originalUrl || '')
    .split('?')[0]
    .replace(/\/\d+(?=\/|$)/g, '/:id');
  return `${req.method} ${normalized}`;
}

function observe(req, statusCode, durationMs) {
  const key = routeKey(req);
  const current = routeStats.get(key) || { count: 0, errors: 0, totalMs: 0, maxMs: 0, samples: [] };
  current.count += 1;
  current.errors += statusCode >= 500 ? 1 : 0;
  current.totalMs += durationMs;
  current.maxMs = Math.max(current.maxMs, durationMs);
  current.samples.push(durationMs);
  if (current.samples.length > MAX_SAMPLES_PER_ROUTE) current.samples.shift();
  routeStats.set(key, current);
}

function percentile(sorted, percentileValue) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1)];
}

function snapshot() {
  return Array.from(routeStats.entries()).map(([route, value]) => {
    const sorted = [...value.samples].sort((left, right) => left - right);
    return {
      route,
      count: value.count,
      errors: value.errors,
      averageMs: Number((value.totalMs / value.count).toFixed(2)),
      p50Ms: Number(percentile(sorted, 0.5).toFixed(2)),
      p95Ms: Number(percentile(sorted, 0.95).toFixed(2)),
      p99Ms: Number(percentile(sorted, 0.99).toFixed(2)),
      maxMs: Number(value.maxMs.toFixed(2)),
    };
  }).sort((left, right) => right.p95Ms - left.p95Ms);
}

function performanceMiddleware(req, res, next) {
  const started = process.hrtime.bigint();
  const originalEnd = res.end;
  res.end = function monitoredEnd(...args) {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    if (!res.headersSent) {
      res.setHeader('Server-Timing', `app;dur=${durationMs.toFixed(2)}`);
      res.setHeader('X-Response-Time', `${durationMs.toFixed(2)}ms`);
    }
    observe(req, res.statusCode, durationMs);
    return originalEnd.apply(this, args);
  };
  next();
}

module.exports = { performanceMiddleware, snapshot };
