export type PerformanceDetails = {
  success?: boolean;
  candidateCount?: number;
  outcome?: 'completed' | 'failed' | 'cancelled';
  attemptNumber?: number;
};

let diagnosticsEnabled = false;

export function configurePerformanceDiagnostics(enabled: boolean) {
  diagnosticsEnabled = enabled === true;
}

export function isPerformanceDiagnosticsEnabled() {
  return diagnosticsEnabled;
}

export function performanceNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function emit(event: string, details: Record<string, string | number | boolean | null>) {
  if (!diagnosticsEnabled) return;
  // Callers pass only fixed labels, aggregate counts, durations, and statuses.
  console.info(`[performance] ${event}`, details);
}

export function beginPerformanceStage(stage: string) {
  if (!diagnosticsEnabled) return null;
  return { stage, startedAt: performanceNow(), finished: false };
}

export function endPerformanceStage(
  marker: ReturnType<typeof beginPerformanceStage>,
  details: PerformanceDetails = {},
) {
  if (!marker || marker.finished) return;
  marker.finished = true;
  emit('operation-stage', {
    stage: marker.stage,
    durationMs: Math.round((performanceNow() - marker.startedAt) * 10) / 10,
    success: details.success ?? true,
    candidateCount: details.candidateCount ?? 0,
    outcome: details.outcome ?? (details.success === false ? 'failed' : 'completed'),
    attemptNumber: details.attemptNumber ?? 0,
  });
}

export function emitPerformanceEvent(
  event: string,
  details: Record<string, string | number | boolean | null>,
) {
  emit(event, details);
}
