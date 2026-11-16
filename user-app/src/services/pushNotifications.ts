import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';
import { loadSession } from './session';
import { createSessionScopedSingleFlight } from '../utils/sessionScopedSingleFlight';

export const FLOOD_EMERGENCY_CHANNEL_ID = 'flood-emergency-v1';
const PUSH_TOKEN_STORAGE_KEY = '@cddrmd:resident_expo_push_token';
let pushRegistrationGeneration = 0;
let pushCleanupPromise: Promise<void> | null = null;
const pushRegistrationFlight = createSessionScopedSingleFlight<string | null>();
let queuedDevicePushToken: Notifications.DevicePushToken | null = null;
let registeredSnapshot: { scope: number; expoPushToken: string } | null = null;
const registrationTokensByScope = new Map<number, string>();

Notifications.setNotificationHandler({
  handleNotification: async () => {
    const session = await loadSession().catch(() => null);
    const residentSessionActive = session?.user?.role === 'user';
    return {
    shouldShowBanner: residentSessionActive,
    shouldShowList: residentSessionActive,
    shouldPlaySound: residentSessionActive,
    shouldSetBadge: false,
    priority: Notifications.AndroidNotificationPriority.MAX,
    };
  },
});

async function configureAndroidFloodChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(FLOOD_EMERGENCY_CHANNEL_ID, {
    name: 'Emergency Flood Alerts',
    description: 'Urgent moderate and high water-level warnings for your barangay.',
    importance: Notifications.AndroidImportance.MAX,
    bypassDnd: true,
    enableLights: true,
    lightColor: '#ef2b20',
    enableVibrate: true,
    vibrationPattern: [0, 600, 250, 600, 250, 1000],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    showBadge: true,
    sound: 'default',
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.ALARM,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
    },
  });
}

export function beginResidentPushNotificationSession() {
  pushRegistrationGeneration += 1;
  registeredSnapshot = null;
  queuedDevicePushToken = null;
  return pushRegistrationGeneration;
}

async function registerResidentPushTokenOnce(
  scope: number,
  devicePushToken?: Notifications.DevicePushToken,
) {
  if (Platform.OS === 'web') return null;
  if (pushCleanupPromise) await pushCleanupPromise.catch(() => {});
  if (scope !== pushRegistrationGeneration) return null;
  await configureAndroidFloodChannel();

  const existingPermission = await Notifications.getPermissionsAsync();
  const permission = existingPermission.granted
    ? existingPermission
    : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return null;
  if (scope !== pushRegistrationGeneration) return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId
    || Constants.easConfig?.projectId;
  if (!projectId) throw new Error('Expo project ID is unavailable for push registration.');

  // A push-token listener already supplies the new native token. Passing it
  // through avoids calling getDevicePushTokenAsync from inside that listener,
  // which Expo documents as a source of infinite listener recursion.
  const expoPushToken = (await Notifications.getExpoPushTokenAsync({
    projectId,
    ...(devicePushToken ? { devicePushToken } : {}),
  })).data;
  if (scope !== pushRegistrationGeneration) return null;
  registrationTokensByScope.set(scope, expoPushToken);
  if (registeredSnapshot?.scope === scope && registeredSnapshot.expoPushToken === expoPushToken) {
    return expoPushToken;
  }
  await api.post('/reports/notifications/push-token', {
    expoPushToken,
    platform: Platform.OS,
  });
  if (scope !== pushRegistrationGeneration) return null;
  await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, expoPushToken);
  registeredSnapshot = { scope, expoPushToken };
  return expoPushToken;
}

export function registerResidentPushNotifications(
  scope: number,
  devicePushToken?: Notifications.DevicePushToken,
) {
  if (Platform.OS === 'web' || scope !== pushRegistrationGeneration) return Promise.resolve(null);
  if (devicePushToken) queuedDevicePushToken = devicePushToken;
  if (pushRegistrationFlight.has(scope)) return pushRegistrationFlight.current(scope)!;

  return pushRegistrationFlight.run(scope, async () => {
    let nextDeviceToken = devicePushToken;
    let result: string | null = null;
    do {
      queuedDevicePushToken = null;
      result = await registerResidentPushTokenOnce(scope, nextDeviceToken);
      nextDeviceToken = queuedDevicePushToken || undefined;
    } while (nextDeviceToken && scope === pushRegistrationGeneration);
    return result;
  });
}

export function unregisterResidentPushNotifications(authorizationToken?: string) {
  if (Platform.OS === 'web') return Promise.resolve();
  const endedScope = pushRegistrationGeneration;
  const registrationToSettle = pushRegistrationFlight.current(endedScope);
  pushRegistrationGeneration += 1;
  queuedDevicePushToken = null;
  registeredSnapshot = null;
  const previousCleanup = pushCleanupPromise;
  const cleanup = (async () => {
    if (previousCleanup) await previousCleanup.catch(() => {});
    if (registrationToSettle) await registrationToSettle.catch(() => {});
    const expoPushToken = registrationTokensByScope.get(endedScope)
      || await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
    if (!expoPushToken) return;
    try {
      const cleanupConfig: any = {
        data: { expoPushToken },
        // Logout clears the shared authorization header immediately. Supplying
        // the captured token only to this revocation request lets cleanup finish
        // in the background without keeping the signed-in session alive.
        headers: authorizationToken
          ? { Authorization: `Bearer ${authorizationToken}` }
          : undefined,
        __skipAuthRefresh: true,
      };
      await api.delete('/reports/notifications/push-token', cleanupConfig);
    } finally {
      registrationTokensByScope.delete(endedScope);
      // Never expose a previous resident's token snapshot to the next account.
      await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
    }
  })();
  const trackedCleanup = cleanup.finally(() => {
    if (pushCleanupPromise === trackedCleanup) pushCleanupPromise = null;
  });
  pushCleanupPromise = trackedCleanup;
  return trackedCleanup;
}

export function subscribeToPushTokenChanges(scope: number) {
  if (Platform.OS === 'web') return null;
  return Notifications.addPushTokenListener((devicePushToken) => {
    registerResidentPushNotifications(scope, devicePushToken).catch(() => {});
  });
}
