import AsyncStorage from '@react-native-async-storage/async-storage';

const TEST_MODE_KEY = '@cddrmd:test_mode_enabled';

export async function loadTestMode() {
  return (await AsyncStorage.getItem(TEST_MODE_KEY)) === 'true';
}

export async function saveTestMode(enabled: boolean) {
  await AsyncStorage.setItem(TEST_MODE_KEY, String(enabled));
}
