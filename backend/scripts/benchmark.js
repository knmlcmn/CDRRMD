const { performance } = require('node:perf_hooks');

function option(name, fallback) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : fallback;
}

function positiveInteger(name, fallback) {
  const value = Number(option(name, fallback));
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`--${name} must be a positive integer.`);
  }
  return value;
}

function percentile(sorted, fraction) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] || 0;
}

async function request(url, headers) {
  const started = performance.now();
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    await response.arrayBuffer();
    const serverDurationMs = Number.parseFloat(response.headers.get('x-response-time'));
    return {
      durationMs: performance.now() - started,
      serverDurationMs: Number.isFinite(serverDurationMs) ? serverDurationMs : null,
      status: response.status,
      ok: response.ok,
    };
  } catch (error) {
    return { durationMs: performance.now() - started, status: 0, ok: false, error: error.message };
  }
}

async function runPath(baseUrl, path, requests, concurrency, warmup, headers) {
  const url = new URL(path, `${baseUrl.replace(/\/$/, '')}/`).toString();
  for (let index = 0; index < warmup; index += 1) await request(url, headers);

  const samples = [];
  let cursor = 0;
  const started = performance.now();
  async function worker() {
    while (cursor < requests) {
      cursor += 1;
      samples.push(await request(url, headers));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, worker));
  const elapsedMs = performance.now() - started;
  const durations = samples.map((sample) => sample.durationMs).sort((left, right) => left - right);
  const serverDurations = samples.map((sample) => sample.serverDurationMs).filter(Number.isFinite).sort((left, right) => left - right);
  const errors = samples.filter((sample) => !sample.ok);
  return {
    path,
    requests,
    concurrency,
    errors: errors.length,
    statuses: Object.fromEntries([...new Set(samples.map((sample) => sample.status))].map((status) => [status, samples.filter((sample) => sample.status === status).length])),
    throughputRps: Number((requests / (elapsedMs / 1000)).toFixed(2)),
    server: serverDurations.length ? {
      averageMs: Number((serverDurations.reduce((sum, value) => sum + value, 0) / serverDurations.length).toFixed(2)),
      p50Ms: Number(percentile(serverDurations, 0.5).toFixed(2)),
      p95Ms: Number(percentile(serverDurations, 0.95).toFixed(2)),
      p99Ms: Number(percentile(serverDurations, 0.99).toFixed(2)),
      maxMs: Number(serverDurations[serverDurations.length - 1].toFixed(2)),
    } : null,
    roundTrip: {
      averageMs: Number((durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(2)),
      p50Ms: Number(percentile(durations, 0.5).toFixed(2)),
      p95Ms: Number(percentile(durations, 0.95).toFixed(2)),
      p99Ms: Number(percentile(durations, 0.99).toFixed(2)),
      maxMs: Number(durations[durations.length - 1].toFixed(2)),
    },
  };
}

async function main() {
  const baseUrl = option('base-url', process.env.BENCHMARK_BASE_URL || 'http://localhost:4000');
  const paths = option('path', '/api/health,/api/flood-risk/hardware-sensors').split(',').map((value) => value.trim()).filter(Boolean);
  const requests = positiveInteger('requests', 200);
  const concurrency = positiveInteger('concurrency', 20);
  const warmup = positiveInteger('warmup', 10);
  const targetP95 = Number(option('target-p95', 20));
  const headers = process.env.BENCHMARK_TOKEN
    ? { Authorization: `Bearer ${process.env.BENCHMARK_TOKEN}` }
    : {};

  const results = [];
  for (const path of paths) {
    results.push(await runPath(baseUrl, path, requests, concurrency, warmup, headers));
  }
  console.log(JSON.stringify({ testedAt: new Date().toISOString(), baseUrl, targetP95Ms: targetP95, results }, null, 2));

  if (results.some((result) => result.errors > 0 || (result.server?.p95Ms ?? result.roundTrip.p95Ms) > targetP95)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
