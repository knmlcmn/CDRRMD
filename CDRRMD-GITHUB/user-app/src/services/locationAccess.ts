import { Platform } from 'react-native';
import * as Location from 'expo-location';

export type LiveLocation = { latitude: number; longitude: number };

export type LocationAccessResult =
  | { ok: true; location: LiveLocation }
  | { ok: false; message: string };

const LOCATION_TIMEOUT_MS = 15000;

function timeoutAfter(ms: number) {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('LOCATION_TIMEOUT')), ms);
  });
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

    const permission = requestPermission
      ? await Location.requestForegroundPermissionsAsync()
      : await Location.getForegroundPermissionsAsync();

    if (permission.status !== 'granted') {
      return { ok: false, message: permissionMessage(permission.canAskAgain) };
    }

    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      return {
        ok: false,
        message: 'Your device location is turned off. Turn it on to continue and keep automatic barangay assignment active.',
      };
    }

    const position = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        mayShowUserSettingsDialog: true,
      }),
      timeoutAfter(LOCATION_TIMEOUT_MS),
    ]);

    return {
      ok: true,
      location: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      },
    };
  } catch (error: any) {
    const rawMessage = String(error?.message || '').toLowerCase();
    return {
      ok: false,
      message: rawMessage.includes('location_timeout')
        ? 'A live location could not be detected. Make sure location is turned on, then select Try Again.'
        : 'Location is unavailable. Turn on device location and allow access for this app, then select Try Again.',
    };
  }
}
