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
