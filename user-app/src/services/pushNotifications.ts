import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

export const FLOOD_EMERGENCY_CHANNEL_ID = 'flood-emergency-v1';
const PUSH_TOKEN_STORAGE_KEY = '@cddrmd:resident_expo_push_token';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
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

export async function registerResidentPushNotifications() {
  if (Platform.OS === 'web') return null;
  await configureAndroidFloodChannel();

  const existingPermission = await Notifications.getPermissionsAsync();
  const permission = existingPermission.granted
    ? existingPermission
    : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId
    || Constants.easConfig?.projectId;
  if (!projectId) throw new Error('Expo project ID is unavailable for push registration.');

  const expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await api.post('/reports/notifications/push-token', {
    expoPushToken,
    platform: Platform.OS,
  });
  await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, expoPushToken);
  return expoPushToken;
}

export async function unregisterResidentPushNotifications() {
  if (Platform.OS === 'web') return;
  const expoPushToken = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
  if (!expoPushToken) return;
  await api.delete('/reports/notifications/push-token', { data: { expoPushToken } });
  await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
}

export function subscribeToPushTokenChanges() {
  if (Platform.OS === 'web') return null;
  return Notifications.addPushTokenListener(() => {
    registerResidentPushNotifications().catch(() => {});
  });
}
