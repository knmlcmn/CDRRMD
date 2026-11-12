import { InteractionManager } from 'react-native';
import * as Updates from 'expo-updates';
import {
  beginPerformanceStage,
  configurePerformanceDiagnostics,
  emitPerformanceEvent,
  endPerformanceStage,
  isPerformanceDiagnosticsEnabled,
  performanceNow,
} from './performanceDiagnosticsCore';

const diagnosticsEnabled = __DEV__ || process.env.EXPO_PUBLIC_PERFORMANCE_DIAGNOSTICS === 'true';
configurePerformanceDiagnostics(diagnosticsEnabled);
const navigationStarts = new Map<string, number>();
let activeApiRequests = 0;
let maximumApiConcurrency = 0;

function now() {
  return performanceNow();
}

function emit(event: string, details: Record<string, string | number | boolean | null>) {
  emitPerformanceEvent(event, details);
}

export { beginPerformanceStage, endPerformanceStage };

export function logRuntimeDiagnostics() {
  emit('runtime', {
    updateId: Updates.updateId || 'embedded',
    runtimeVersion: Updates.runtimeVersion || 'unknown',
    channel: Updates.channel || 'unknown',
    embeddedLaunch: Updates.isEmbeddedLaunch,
  });
}

export function startJsStallMonitor() {
  if (!isPerformanceDiagnosticsEnabled()) return () => {};
  const intervalMs = 1_000;
  let expectedAt = Date.now() + intervalMs;
  const timer = setInterval(() => {
    const current = Date.now();
    const delayMs = current - expectedAt;
    expectedAt = current + intervalMs;
    if (delayMs >= 350) emit('js-thread-stall', { delayMs });
  }, intervalMs);
  return () => clearInterval(timer);
}

export function markNavigationStart(screen: string) {
  if (!diagnosticsEnabled) return;
  navigationStarts.set(screen, now());
}

export function markNavigationSettled(screen: string) {
  if (!diagnosticsEnabled) return;
  const startedAt = navigationStarts.get(screen);
  if (startedAt === undefined) return;
  navigationStarts.delete(screen);
  InteractionManager.runAfterInteractions(() => {
    emit('navigation-settled', { screen, durationMs: Math.round((now() - startedAt) * 10) / 10 });
  });
}

export function markInitializationStart(component: string) {
  if (!diagnosticsEnabled) return null;
  return { component, startedAt: now() };
}

export function markInitializationEnd(marker: { component: string; startedAt: number } | null) {
  if (!marker) return;
  emit('initialization', {
    component: marker.component,
    durationMs: Math.round((now() - marker.startedAt) * 10) / 10,
  });
}

export function logMapLifecycle(
  lifecycle: 'component-mount' | 'component-unmount' | 'document-load-start' | 'document-load-end' | 'leaflet-ready',
  instanceId: number,
  loadSequence: number,
) {
  emit('map-lifecycle', {
    lifecycle,
    instanceId,
    loadSequence,
  });
}

function sanitizedRoute(url?: string) {
  return String(url || 'unknown')
    .split('?')[0]
    .replace(/\/\d+(?=\/|$)/g, '/:id');
}

export function beginApiRequest(method?: string, url?: string) {
  if (!diagnosticsEnabled) return null;
  activeApiRequests += 1;
  maximumApiConcurrency = Math.max(maximumApiConcurrency, activeApiRequests);
  return {
    method: String(method || 'GET').toUpperCase(),
    route: sanitizedRoute(url),
    startedAt: now(),
    finished: false,
  };
}

export function endApiRequest(
  marker: ReturnType<typeof beginApiRequest>,
  status: number | null,
  failed: boolean,
) {
  if (!marker || marker.finished) return;
  marker.finished = true;
  activeApiRequests = Math.max(0, activeApiRequests - 1);
  emit('api-request', {
    method: marker.method,
    route: marker.route,
    status,
    failed,
    durationMs: Math.round((now() - marker.startedAt) * 10) / 10,
    concurrentAtCompletion: activeApiRequests,
    maximumConcurrency: maximumApiConcurrency,
  });
}
