# CDRRMD Production Optimization Integration Report

## Scope and baseline

- Optimization branch: `optimize/production-ota-01a18cc3`
- Preserved OTA baseline: `5eab0b60a8c081fd5a01cc6a1bedb33e72fb5844`
- Prior Weather optimization: `cf3bb5ad2b2805c35e6487dee2daa489fe3dcb75`
- This pass covers Request Rescue responsiveness, evacuation-area loading, OSRM request lifecycle, and inactive map WebView retention.
- No production deployment, OTA publication, APK build/install, migration, live rescue test, or external service mutation was performed.

## Investigation findings

1. **Repeated evacuation center requests:** screen bootstrap and the focus effect can start the same `/content/evacuation-areas` request together. The four-second focused polling loop can also overlap a slow prior request. Unlike recent-rescue polling, evacuation loading had no in-flight guard.
2. **OSRM calls:** initial center selection is already efficient and behaviorally important: one OSRM table request ranks all eligible production candidates, followed by one geometry request for the selected destination. `appliedRoadPlanAreaIdRef` already prevents an immediate duplicate geometry call. However, a superseded route effect only ignored its result; it did not abort the network request.
3. **Map WebView retention:** the tab screen remains mounted when another tab/screen is focused, so its WebView could remain allocated and continue its embedded timers. Production only unmounted one map instance when switching into fullscreen mode.
4. **Renders:** `mapHtml` and selected-area lookup were already memoized, and stable-data setters already avoid equal-state updates. The map message callback was recreated on each parent render, and the shared `PlatformMap` had no memo boundary.
5. **Location and nearest-center calculation:** production obtains location during bootstrap and uses the established backend barangay assignment. Nearest-center selection uses road distance, road reachability, capacity, local-first eligibility, and cross-barangay fallback. No safe CPU-only replacement was found that would guarantee identical selection results.
6. **Polling duplication:** recent rescue records already have an in-flight guard and focused polling already stops on blur. Evacuation-area polling lacked equivalent overlap protection. The existing four-second cadence was preserved to avoid changing freshness behavior.

## Files modified

- `user-app/src/screens/RescueMapScreen.tsx`
- `user-app/src/components/PlatformMap.tsx`
- `user-app/src/services/routingService.ts`
- `user-app/src/utils/singleFlight.ts`
- `user-app/tests/singleFlight.test.ts`
- `user-app/tests/routingService.test.ts`
- `artifacts/CDRRMD-OPTIMIZATION-INTEGRATION-REPORT.md`

The earlier branch commit also modifies `user-app/src/screens/WeatherScreen.tsx`; that file was not changed in this rescue pass.

## Optimizations integrated

### Overlapping evacuation loads

- Added a small single-flight coordinator so simultaneous background/bootstrap/focus/poll calls share one in-flight evacuation-area request.
- The coordinator clears after success or failure, so the next scheduled refresh still performs a new request.
- Submission validation and `NO_AVAILABLE_EVACUATION_AREA` recovery explicitly bypass coalescing and retain an independent fresh request.
- Endpoint, response normalization, capacity interpretation, state updates, and polling cadence are unchanged.

### Obsolete OSRM cancellation

- Added optional `AbortSignal` support to the existing routing service without changing URLs, timeouts, snap validation, ranking, distance, ETA, or geometry parsing.
- The selected-area route effect now aborts its OSRM request when replaced or unmounted instead of merely discarding the eventual result.
- The best-route function passes the same signal through its table and selected-route requests.

### Inactive map lifecycle

- The Request Rescue screen now renders `PlatformMap` only while the screen is focused.
- On blur, the WebView/iframe unmounts and fullscreen mode closes. React-owned rescue form state, selected center, route data, proof image data, people count, notes, and rescue records remain mounted in the screen component.
- On focus, the map is recreated from current React state and the current memoized HTML payload.

### Render containment

- Stabilized the Rescue map message handler with `useCallback`.
- Wrapped the shared `PlatformMap` component in `React.memo`; it still updates whenever any actual prop changes.

## Optimizations blocked

The following staging changes were not integrated because they alter business behavior or lack sufficient parity evidence:

- Limiting or pre-ranking evacuation candidates before the production OSRM table request. This can change the selected center and is **BLOCKED**.
- Filtering the evacuation-area API request by barangay or removing cross-barangay fallback. This changes production eligibility/fallback behavior and is **BLOCKED**.
- Requiring a new emergency-location read at request start or submission. This changes location and submission behavior and is **BLOCKED**.
- Revalidating and replacing the selected route during submission beyond existing production checks. This changes submission behavior and is **BLOCKED**.
- Replacing `/reports/mine` with a staging rescue-summary endpoint. This changes API behavior and is **BLOCKED**.
- Reducing the idle polling cadence from four seconds to thirty seconds. This changes data freshness and is **BLOCKED** pending product/device validation.
- Replacing map HTML reload behavior with a new WebView post-message rendering protocol. This changes Leaflet layer, viewport, and popup lifecycle and is **BLOCKED** pending focused device regression testing.
- Caching completed OSRM results. Route results can become stale and selection parity is not proven, so this is **BLOCKED**.

## Validation results

- Mobile offline tests: **15/15 PASS**.
- TypeScript compilation (`npx tsc --noEmit`): **PASS**.
- Rescue routing regression tests: **PASS**.
  - The shortest reachable OSRM table distance remains the selected destination.
  - Selection still performs one table request and one geometry request.
  - Superseded route requests propagate cancellation to fetch.
- Evacuation request coordination tests: **PASS**.
  - Overlapping callers share one request.
  - A settled request does not suppress the next refresh.
  - A failed request does not suppress recovery.
- Screen lifecycle source check: **PASS**.
  - Both regular and fullscreen maps are focus-gated.
  - The inactive map is replaced by a non-WebView placeholder.
  - Rescue form state remains owned by the still-mounted screen.
- Source diff check: **PASS** (`git diff --check`).
- Preserved production baseline comparison: no changes to backend assignment/escalation, Barangay Portal, Firebase monitoring, flood notification, API authorization, or location-access files.

## Functional parity findings

- Production barangay detection and all supported barangay boundaries are unchanged.
- `hasCapacityFor`, full/available normalization, same-barangay matching, and local-first eligibility are unchanged.
- Cross-barangay fallback remains available only under the existing production rule when no eligible local center exists.
- Nearest-center selection remains based on the existing OSRM road-distance table and selected-route geometry verification.
- Rescue payload fields and `/reports` submission are unchanged.
- Barangay Rescuer assignment, CDRRMD backup escalation, Barangay Portal arrival confirmation, Firebase monitoring, and flood notifications are outside the modified files and unchanged from the preserved baseline.

## Remaining risks

- Automated tests do not measure native WebView memory release, frame time, radio usage, or end-to-end device latency.
- Remounting the map after returning to the screen resets transient Leaflet-only viewport/popup state. Rescue form and route state are retained and reconstruct the functional map state.
- OSRM cancellation depends on the platform fetch implementation honoring `AbortSignal`; correctness does not depend on cancellation because stale results were already ignored.
- Four-second focused polling remains intentionally unchanged and may still generate significant network traffic when requests complete quickly.
- No latency improvement is claimed without measured device results.

## Next recommended optimization

Run an instrumented physical-device session that records WebView process memory, JS/UI frame timing, evacuation endpoint request counts, and OSRM request counts while repeatedly entering/leaving Request Rescue and completing a representative rescue form. If parity holds, evaluate a narrowly scoped polling cadence change separately, with freshness acceptance criteria defined before implementation.

## Rescuer Portal and backend efficiency pass

### Investigation findings

- The portal shell and Flood Monitoring screen already share one reference-counted water-sensor poller. A second Firebase/hardware polling loop was not found.
- Assignments polling already has an in-flight guard, retains its five-second cadence, and loads active assignments plus weekly history concurrently.
- Responder GPS publishing and portal presence heartbeat are separate 15-second responsibilities. Both update presence, but safely coalescing them would require waiting or a freshness window that can change heartbeat timing during a hung request or tab transition.
- Assignment and new-assignment OSRM effects ignored stale results but did not abort superseded network requests.
- The regular assignment map remained mounted underneath the fullscreen map.
- The new-assignment map rebuilt its complete HTML string for every GPS/route update even though `PlatformMap` already preserves its initial document and accepts live update messages.
- The backend location endpoint intentionally holds an atomic transaction across assignment locks, pickup, capacity validation, rerouting, status logs, and notifications. The staging rewrite changes sequencing and fallback parameters, so it is not parity-safe.
- The production PostgreSQL pool is already bounded and environment-configurable (`2` connections on Vercel by default, `10` elsewhere), with configurable idle and connection timeouts.

### Optimizations integrated

- Assignment-route and new-assignment-route effects now pass `AbortSignal` to the existing routing service and abort only superseded/unmounted requests. Trigger dependencies, OSRM inputs, fallback display, and refresh frequency are unchanged.
- The selected new-assignment lookup is memoized across GPS-only renders.
- The new-assignment map uses a stable initial HTML document; live responder position and route changes continue through the existing `rescue-map-update` message.
- The regular map WebView unmounts while its fullscreen replacement is active and remounts from current React state when fullscreen closes.
- Added offline backend contract tests that guard atomic responder transitions, cross-barangay fallback, presence rules, and pool configuration. Backend runtime implementation and API contracts were not changed.

### Optimizations blocked

- Staging route-distance/time throttling is **BLOCKED** because it suppresses some production route refreshes and changes data freshness.
- Heartbeat/GPS request coalescing is **BLOCKED** because a hung GPS request can delay presence heartbeat, while a time-window alternative changes freshness after leaving Assignments.
- Moving OSRM/capacity preparation outside the backend location transaction is **BLOCKED** because it changes assignment/capacity sequencing and cross-barangay fallback behavior.
- Combining active assignments and weekly history into a new endpoint is **BLOCKED** because it changes the existing API contract.
- Caching assignment or history responses is **BLOCKED** because equivalent five-second freshness was not proven.
- Pool instrumentation from staging was not integrated: it adds observability, not a measured pool-pressure reduction, and depends on additional staging-only modules.

### Files modified in this pass

- `user-app/src/rescuer/screens/AssignmentsScreen.tsx`
- `backend/package.json`
- `backend/tests/rescuerProductionContracts.test.js`
- `artifacts/CDRRMD-OPTIMIZATION-INTEGRATION-REPORT.md`

### Validation

- Mobile offline tests: **15/15 PASS**.
- Backend offline contract tests: **3/3 PASS**.
- TypeScript compilation: **PASS**.
- Existing rescue routing regression tests: **PASS**.
- Rescuer source lifecycle checks: **PASS** (regular map excluded during fullscreen; both route effects abort on cleanup).
- Backend JavaScript syntax checks: **PASS**.
- Source diff check against the preserved production baseline: **PASS**.
- No polling interval, API path, authentication/permission check, assignment query, location update, status transition, notification write, or database pool runtime setting changed.

### Functional parity

- Barangay assignment and CDRRMD backup escalation remain unchanged.
- Rescuer occupied/available selection and the 45-second online eligibility rule remain unchanged.
- Pickup, reroute, in-progress, arrival, and resolved transitions remain unchanged.
- Barangay Portal arrival confirmation remains unchanged.
- GPS watcher, 10-second web location refresh, 15-second server location refresh, 15-second portal heartbeat, and five-second assignment/history refresh remain unchanged.
- Notification behavior, API response shapes, authentication, permissions, evacuation eligibility, and cross-barangay fallback remain unchanged.

### Measured results and expected effects

- Measured here: test outcomes, compilation, syntax validation, and source-level request/lifecycle assertions only.
- Expected but not device-measured: fewer obsolete OSRM requests completing, one fewer retained WebView during fullscreen, and less repeated HTML-string generation during GPS updates.
- No latency, memory, battery, database-load, or frame-rate improvement is claimed without controlled device/backend measurements.

### Remaining risks and staging readiness

- Abort effectiveness depends on the platform fetch implementation; stale results remain guarded even if transport cancellation is delayed.
- Closing fullscreen recreates the regular map document and may reset transient Leaflet-only viewport/popup state; assignment, route, and location state are retained in React.
- Static backend contract tests do not replace database-backed integration tests.
- The source is ready for a controlled staging APK test cycle, but no APK was built or installed in this pass. Device testing should verify assignment alerts, dispatch, live GPS routing, automatic pickup, evacuation reroute, fullscreen transitions, arrival confirmation, and notification delivery before promotion.
