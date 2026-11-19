# PR #6 Android v10 OTA release candidate

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
`64cd3fcaf73c260e351560361f68609165dab236`. Publication still requires a
clean reviewed main SHA and a physical two-launch verification; do not publish
from this dirty preparation worktree.

## Rescue request contract

The client obtains a new high-accuracy observation immediately before submit
and sends `latitude`, `longitude`, `locationCapturedAt`, and
`locationAccuracyMeters`. Client validation permits observations at most 30
seconds old and accuracy of 50 meters or better, leaving a 15-second buffer
inside the backend's 45-second limit.

## Release gate

The GitHub workflow is manual-only. It runs only from `main`, requires the full
reviewed SHA plus the exact confirmation phrase `PUBLISH_RUNTIME_1_0_4`, checks
out that SHA, verifies the v10 identity, and targets only
`production-v10-performance`.

Before dispatch, record the clean merge SHA, confirm the current EAS channel
mapping and fingerprint, and obtain explicit OTA publication approval.
