# Production main Android v10 OTA release candidate

This document prepares a candidate only. It does not authorize publication.

## Target identity

- Expo project: `@polmokmoktomi/user-app`
- Project ID: `5bfee76a-32ab-4691-a88f-98236817fba8`
- Android package: `ph.gov.calambacity.cdrrmd`
- versionCode: `10`
- Runtime: `1.0.4`
- Channel: `production-v10-performance`
- Environment: `production`

The existing v10 build and latest channel update share native fingerprint
`64cd3fcaf73c260e351560361f68609165dab236`. The active Android update is
`01a1e3c2-fe90-7379-b3f2-0d4320ab27c4` from commit
`dfcc7bd512fd76db46f86ee2abeeed2cd3207622`; it does not contain the production
main changes at `d2a233f52f1973b438923d1febfae4e76661f698`.

The production-main fingerprint currently evaluates to
`e2ea81bafc39908d71d7d81e05ba894ce63e8f0c`. The only native-input file changed
between the active OTA source and production main is `package.json`, where two
release scripts were added; app configuration, dependencies, lockfile, assets,
permissions, runtime, and native modules are unchanged. This is therefore an
OTA-compatible JavaScript update for the existing v10 APK, not a new-APK
requirement. Publication still requires owner approval and physical Android
two-launch verification.

## Responder location lifecycle

- Web and Android responder location publication is foreground-only.
- The client refreshes every 15 seconds, accepts a fix for at most 30 seconds,
  and rate-limits publication to once per 10 seconds.
- The backend and maps accept live responder presence for at most 45 seconds;
  admin and barangay maps poll every 5 seconds and never route from an expired
  coordinate.
- Dispatch ranking uses responder GPS only inside that same 45-second window;
  otherwise it uses the existing coarse barangay/CDRRMD fallback, not the stale
  last-known coordinate. Pickup inference independently requires a fresh,
  accurate, sustained observation.
- The v10 APK has only coarse/fine foreground location permissions. It has no
  background-location task, background permission, or location foreground
  service, so background, locked-screen, and device-idle GPS reporting must not
  be claimed.

## Rescue request contract

The client requires Location Services, foreground permission, and real valid
coordinates before rescue routing or submission. It requests a current
observation and sends `latitude`, `longitude`, `locationCapturedAt`, and
`locationAccuracyMeters`, but capture time and accuracy are advisory metadata:
weak, stale, or missing metadata does not by itself reject a rescue request.
The backend remains authoritative for the six supported barangays and permits
real out-of-area rescue requests only when Test Mode is enabled.

## Release gate

The GitHub workflow is manual-only. It runs only from `main`, requires the full
reviewed SHA plus the exact confirmation phrase `PUBLISH_RUNTIME_1_0_4`, checks
out that SHA, verifies the v10 identity, and targets only
`production-v10-performance`.

Before dispatch, record the clean merge SHA, confirm the current EAS channel
mapping and fingerprint, and obtain explicit OTA publication approval.
