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

/** Permission alone is insufficient when the device location service is off. */
export async function requireLiveLocation(requestPermission: boolean): Promise<LocationAccessResult> {
  try {
    const permission = requestPermission
      ? await Location.requestForegroundPermissionsAsync()
      : await Location.getForegroundPermissionsAsync();

    if (permission.status !== 'granted') {
      return { ok: false, message: permissionMessage(permission.canAskAgain) };
    }

    if (Platform.OS !== 'web') {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        return {
          ok: false,
          message: 'Your device location is turned off. Turn it on to continue and keep automatic barangay assignment active.',
        };
      }
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
