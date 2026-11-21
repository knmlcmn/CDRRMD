const MAX_OBSERVATION_AGE_MS = 45_000;
const MAX_FUTURE_SKEW_MS = 10_000;
const MAX_ACCURACY_METERS = 40;
const PROXIMITY_RADIUS_METERS = 60;
const MIN_SAMPLE_INTERVAL_MS = 10_000;
const MIN_SUSTAINED_DURATION_MS = 30_000;
const REQUIRED_SAMPLES = 3;

function parseCapturedAt(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function evaluatePickupObservation({
  nowMs = Date.now(),
  capturedAt,
  accuracyMeters,
  distanceMeters,
  acknowledgedAt,
  previousObservedAt,
  proximityStartedAt,
  proximitySampleCount = 0,
}) {
  const observedAtMs = parseCapturedAt(capturedAt);
  const acknowledgedAtMs = Date.parse(String(acknowledgedAt || ''));
  const previousAtMs = Date.parse(String(previousObservedAt || ''));
  const startedAtMs = Date.parse(String(proximityStartedAt || ''));
  const accuracy = Number(accuracyMeters);
  const distance = Number(distanceMeters);
  const fresh = Number.isFinite(observedAtMs)
    && observedAtMs <= nowMs + MAX_FUTURE_SKEW_MS
    && observedAtMs >= nowMs - MAX_OBSERVATION_AGE_MS;
  const accurate = Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= MAX_ACCURACY_METERS;
  const afterAcknowledgement = Number.isFinite(acknowledgedAtMs) && observedAtMs >= acknowledgedAtMs;

  if (!fresh || !accurate || !afterAcknowledgement || !Number.isFinite(distance)) {
    return { accepted: false, qualified: false, reason: 'untrusted-observation' };
  }
  if (Number.isFinite(previousAtMs) && observedAtMs <= previousAtMs) {
    return { accepted: false, qualified: false, reason: 'replayed-observation' };
  }
  if (Number.isFinite(previousAtMs) && observedAtMs - previousAtMs < MIN_SAMPLE_INTERVAL_MS) {
    return { accepted: false, qualified: false, reason: 'sample-too-soon' };
  }
  if (distance > PROXIMITY_RADIUS_METERS) {
    return {
      accepted: true,
      qualified: false,
      reason: 'outside-proximity',
      observedAt: new Date(observedAtMs),
      proximityStartedAt: null,
      proximitySampleCount: 0,
    };
  }

  const startMs = Number.isFinite(startedAtMs) ? startedAtMs : observedAtMs;
  const sampleCount = Math.max(0, Number(proximitySampleCount) || 0) + 1;
  const sustainedMs = observedAtMs - startMs;
  return {
    accepted: true,
    qualified: sampleCount >= REQUIRED_SAMPLES && sustainedMs >= MIN_SUSTAINED_DURATION_MS,
    reason: 'sustained-proximity',
    observedAt: new Date(observedAtMs),
    proximityStartedAt: new Date(startMs),
    proximitySampleCount: sampleCount,
    sustainedMs,
  };
}

module.exports = {
  MAX_ACCURACY_METERS,
  MIN_SUSTAINED_DURATION_MS,
  PROXIMITY_RADIUS_METERS,
  REQUIRED_SAMPLES,
  evaluatePickupObservation,
};
