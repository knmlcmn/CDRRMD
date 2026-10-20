# CDRRMD performance operations

## Runtime setup

1. Start Redis locally with `docker compose -f docker-compose.redis.yml up -d` or use a managed Redis instance.
2. Copy the Redis and pool settings from `backend/.env.example` into `backend/.env`. Production must use a protected Redis URL; do not commit credentials.
3. Run `npm run dev` for the backend and Admin/Barangay portals. Run `npm run web` separately for the Residents/Rescuers app at `http://localhost:8081`.

The backend fails open to bounded in-process caching and rate limiting if Redis is unavailable. `/api/ready` reports database and Redis state; an authenticated admin can inspect rolling route percentiles, pool pressure, cache hits, and memory at `/api/performance`.

## Cache and consistency policy

| Data | Server cache | Accuracy policy |
| --- | ---: | --- |
| Hardware sensor snapshot | 500–750 ms | Firebase refreshes are coalesced; browser/proxy caching is disabled for combined live weather. |
| Alerts and announcements | 2 s | Writes invalidate the key immediately. |
| Evacuation capacity | 1 s | Writes invalidate immediately; transactional capacity checks remain authoritative. |
| Dashboard summary | 1 s | Read optimization only; emergency write APIs bypass the general limiter. |
| Static Calamba map data | 5–60 min | Geometry changes infrequently. |
| Open-Meteo forecast/wind | 10–12 min | Up to one hour of stale data is served only while the provider is unavailable and is marked stale for wind. |

Authentication and OTP endpoints have stricter Redis-backed limits. The general API limit defaults to 3,000 requests per IP per minute. Emergency report, dispatch, and rescuer-location writes bypass that general limit; their validation and authentication remain unchanged.

## Benchmark and load test

Run against an already-started backend:

```powershell
npm run perf:benchmark
npm run perf:load
```

The benchmark target is server-side p95 <= 20 ms (measured from the backend's `X-Response-Time`) for warmed `/api/health` and `/api/flood-risk/hardware-sensors` responses on localhost, with 200 requests, concurrency 20, and 10 warm-up requests. Client round-trip percentiles are reported separately. This target excludes WAN latency, cold external-provider fetches, cold database connections, and client rendering. Override conditions when needed:

```powershell
node backend/scripts/benchmark.js --base-url=http://localhost:4000 --path=/api/health --requests=500 --concurrency=50 --warmup=20 --target-p95=20
```

Set `BENCHMARK_TOKEN` to include authenticated endpoints. Record production-like tests on an isolated staging environment; do not load-test emergency production traffic.

## Recorded local results (2026-10-20)

Conditions: Windows localhost, Node.js 24, development server, 200 requests per endpoint, concurrency 20, 10 warm-up requests. Redis was not installed on the test workstation, so these results also verify the bounded in-process fallback.

| Endpoint | Before round-trip p95 | After server p95 | After round-trip p95 | Errors |
| --- | ---: | ---: | ---: | ---: |
| `/api/health` | 26.40 ms | 0.29 ms | 20.85 ms | 0 |
| `/api/flood-risk/hardware-sensors` | 260.71 ms | 0.68 ms | 37.46 ms | 0 |

The hardware endpoint's local round-trip p95 improved by about 85.6%, while its measured backend work remained below 1 ms p95. A separate 1,000-request, concurrency-50 test completed with zero errors: server p95 was 0.13 ms for health and 0.19 ms for warmed hardware responses. Redis mode should also be tested in staging because no Redis daemon was available on this workstation.

## Remaining external latency

Cold Firebase and Open-Meteo reads remain bounded by their network providers. Redis removes duplicate work across backend instances but cannot eliminate the first upstream request. PostgreSQL latency also depends on hosting distance and plan limits; monitor `databasePool.waiting` and tune `DB_POOL_MAX` within the provider’s connection allowance.
