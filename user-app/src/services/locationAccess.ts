import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { beginPerformanceStage, endPerformanceStage } from '../utils/performanceDiagnosticsCore';

export type LiveLocation = { latitude: number; longitude: number };
export type LiveLocationSubscription = { remove: () => void };

export type LocationAccessResult =
  | { ok: true; location: LiveLocation }
  | { ok: false; message: string };

const LOCATION_TIMEOUT_MS = 15000;

function toLiveLocation(position: Location.LocationObject): LiveLocation {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

async function withLocationTimeout<T>(request: Promise<T>, ms: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('LOCATION_TIMEOUT')), ms);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function permissionMessage(canAskAgain: boolean) {
  if (Platform.OS === 'web') {
    return 'Location access is required. Allow location from the icon beside the browser address bar, then select Try Again.';
  }
  if (!canAskAgain) {
    return 'Location access is required. Open your device settings, allow location for this app, then select Try Again.';
  }
  return 'Location access is required to use this app. Select Try Again and allow the location request.';
}

async function requestWebLocation(): Promise<LocationAccessResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { ok: false, message: 'Location is not supported by this browser.' };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        ok: true,
        location: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        },
      }),
      (error) => resolve({
        ok: false,
        message: error.code === error.PERMISSION_DENIED
          ? 'Location permission was blocked. Allow location from the icon beside the browser address bar, then select Allow Location.'
          : 'A live location could not be detected. Turn on device location, then select Allow Location.',
      }),
      { enableHighAccuracy: true, timeout: LOCATION_TIMEOUT_MS, maximumAge: 0 },
    );
  });
}

/** Permission alone is insufficient when the device location service is off. */
export async function requireLiveLocation(requestPermission: boolean): Promise<LocationAccessResult> {
  try {
    // Calling the browser geolocation API directly from the modal button is
    // what triggers the browser/device permission prompt on the web build.
    if (Platform.OS === 'web') {
      return await requestWebLocation();
    }

    const permissionMarker = beginPerformanceStage('location-permission-readiness');
    const permission = requestPermission
      ? await Location.requestForegroundPermissionsAsync()
      : await Location.getForegroundPermissionsAsync();
    endPerformanceStage(permissionMarker, { success: permission.status === 'granted' });

    if (permission.status !== 'granted') {
      return { ok: false, message: permissionMessage(permission.canAskAgain) };
    }

    const servicesMarker = beginPerformanceStage('location-services-readiness');
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    endPerformanceStage(servicesMarker, { success: servicesEnabled });
    if (!servicesEnabled) {
      return {
        ok: false,
        message: 'Your device location is turned off. Turn it on to continue and keep automatic barangay assignment active.',
      };
    }

    // Both portals maintain a location watcher. Reuse its recent accurate fix
    // before waking GPS and waiting for another satellite/network position.
    const cacheMarker = beginPerformanceStage('location-cache-readiness');
    const recent = await Location.getLastKnownPositionAsync({
      maxAge: 30_000,
      requiredAccuracy: 200,
    }).catch(() => null);
    endPerformanceStage(cacheMarker, { success: Boolean(recent) });
    if (recent) return { ok: true, location: toLiveLocation(recent) };

    const currentMarker = beginPerformanceStage('location-current-position');
    let position: Location.LocationObject;
    try {
      position = await withLocationTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          mayShowUserSettingsDialog: true,
        }),
        LOCATION_TIMEOUT_MS,
      );
      endPerformanceStage(currentMarker);
    } catch (error) {
      endPerformanceStage(currentMarker, { success: false });
      throw error;
    }

    return { ok: true, location: toLiveLocation(position) };
  } catch (error: any) {
    // Android can keep showing a valid map position while a later one-shot GPS
    // request waits for a new satellite fix. Keep using a recent OS-cached fix
    // instead of incorrectly treating that temporary timeout as no location.
    if (Platform.OS !== 'web') {
      try {
        const cached = await Location.getLastKnownPositionAsync({
          maxAge: 120000,
          requiredAccuracy: 2000,
        });
        if (cached) return { ok: true, location: toLiveLocation(cached) };
      } catch {
        // Fall through to the actionable error below.
      }
    }
    const rawMessage = String(error?.message || '').toLowerCase();
    return {
      ok: false,
      message: rawMessage.includes('location_timeout')
        ? 'A live location could not be detected. Make sure location is turned on, then select Try Again.'
        : 'Location is unavailable. Turn on device location and allow access for this app, then select Try Again.',
    };
  }
}

/**
 * Uses Android/iOS's continuous provider so the responder screen does not
 * start overlapping one-shot GPS requests. Permission must be requested by
 * requireLiveLocation first, keeping the prompt tied to a user-visible flow.
 */
export async function watchLiveLocation(
  onLocation: (location: LiveLocation) => void,
): Promise<LiveLocationSubscription | null> {
  if (Platform.OS === 'web') return null;

  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== 'granted' || !(await Location.hasServicesEnabledAsync())) return null;

  return Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 5000,
      distanceInterval: 3,
      mayShowUserSettingsDialog: true,
    },
    (position) => onLocation(toLiveLocation(position)),
  );
}
