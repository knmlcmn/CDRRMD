import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import {
  requireLiveLocation,
  watchLiveLocation,
  type LiveLocation,
  type LiveLocationSubscription,
} from '../../services/locationAccess';
import { updateResponderLocation } from '../services/rescuerService';

export const RESPONDER_LOCATION_REFRESH_MS = 15_000;
export const RESPONDER_LOCATION_MAX_AGE_MS = 30_000;
const MIN_PUBLISH_INTERVAL_MS = 10_000;

export function isFreshResponderLocation(location: LiveLocation, now = Date.now()) {
  return Number.isFinite(location.latitude)
    && location.latitude >= -90 && location.latitude <= 90
    && Number.isFinite(location.longitude)
    && location.longitude >= -180 && location.longitude <= 180
    && Number.isFinite(location.capturedAt)
    && now >= location.capturedAt
    && now - location.capturedAt <= RESPONDER_LOCATION_MAX_AGE_MS;
}

export function useResponderLocationPresence(onAuthError: () => void) {
  const [location, setLocation] = useState<LiveLocation | null>(null);
  const [locationError, setLocationError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let mounted = true;
    let foregroundRun = 0;
    let watcher: LiveLocationSubscription | null = null;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;
    let acquireBusy = false;
    let publishBusy = false;
    let lastPublishedAt = 0;
    let latestPublishedLocation: LiveLocation | null = null;

    function stopForeground() {
      foregroundRun += 1;
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = null;
      watcher?.remove();
      watcher = null;
      latestPublishedLocation = null;
      if (mounted) setLocation(null);
    }

    async function publish(nextLocation: LiveLocation, run: number) {
      if (!mounted || run !== foregroundRun || AppState.currentState !== 'active') return;
      if (!isFreshResponderLocation(nextLocation)) {
        setLocation(null);
        setLocationError('A fresh GPS location is required to appear online and receive dispatches.');
        return;
      }
      const now = Date.now();
      if (publishBusy || now - lastPublishedAt < MIN_PUBLISH_INTERVAL_MS) return;
      publishBusy = true;
      try {
        const { data } = await updateResponderLocation(nextLocation.latitude, nextLocation.longitude);
        if (!mounted || run !== foregroundRun || AppState.currentState !== 'active') return;
        lastPublishedAt = Date.now();
        latestPublishedLocation = nextLocation;
        setLocation(nextLocation);
        setLocationError('');
        if (data.rerouted) setNotice(`Route updated to ${data.evacuationAreaName || 'the nearest available evacuation center'}.`);
        if (data.rerouted || data.pickupConfirmed) setRevision((current) => current + 1);
      } catch (caught: any) {
        if (!mounted || run !== foregroundRun) return;
        setLocation(null);
        if (caught?.response?.status === 401) onAuthError();
        else setLocationError(caught?.response?.data?.message || 'Unable to publish your live responder location.');
      } finally {
        publishBusy = false;
      }
    }

    async function ensureWatcher(run: number) {
      if (watcher || !mounted || run !== foregroundRun || AppState.currentState !== 'active') return;
      try {
        const nextWatcher = await watchLiveLocation((nextLocation) => { void publish(nextLocation, run); });
        if (!mounted || run !== foregroundRun || AppState.currentState !== 'active') {
          nextWatcher?.remove();
          return;
        }
        watcher = nextWatcher;
      } catch {
        // The foreground refresh remains authoritative if a device watcher is unavailable.
      }
    }

    async function acquire(requestPermission: boolean, run: number) {
      if (acquireBusy || !mounted || run !== foregroundRun || AppState.currentState !== 'active') return;
      acquireBusy = true;
      try {
        const result = await requireLiveLocation(requestPermission);
        if (!mounted || run !== foregroundRun || AppState.currentState !== 'active') return;
        if (!result.ok) {
          setLocation(null);
          setLocationError(result.message);
          return;
        }
        await publish(result.location, run);
        await ensureWatcher(run);
      } finally {
        acquireBusy = false;
      }
    }

    function startForeground(requestPermission: boolean) {
      stopForeground();
      const run = foregroundRun;
      void acquire(requestPermission, run);
      refreshTimer = setInterval(() => {
        if (Platform.OS === 'web') {
          void acquire(false, run);
          return;
        }
        if (!latestPublishedLocation || !isFreshResponderLocation(latestPublishedLocation)) {
          watcher?.remove();
          watcher = null;
          setLocation(null);
          void acquire(false, run);
        }
      }, RESPONDER_LOCATION_REFRESH_MS);
    }

    startForeground(true);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') startForeground(false);
      else stopForeground();
    });

    return () => {
      mounted = false;
      stopForeground();
      subscription.remove();
    };
  }, [onAuthError]);

  return { location, locationError, notice, revision };
}
