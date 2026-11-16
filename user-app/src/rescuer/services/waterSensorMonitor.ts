import { AppState } from 'react-native';
import type { WaterLevelSensor } from '../types';
import { createSharedPoller } from '../../utils/sharedPoller';
import { loadWaterLevelSensors } from './rescuerService';

function sensorSignature(sensors: WaterLevelSensor[]) {
  return sensors.map((sensor) => [
    sensor.id,
    sensor.status,
    sensor.hasReading ? 1 : 0,
    sensor.waterLevelPercentage,
    sensor.temperatureCelsius,
    sensor.humidityPercentage,
    sensor.distanceCm,
    sensor.loggedAt,
  ].join(':')).join('|');
}

const monitor = createSharedPoller({
  load: loadWaterLevelSensors,
  signature: sensorSignature,
  intervalMs: 3_000,
  isActive: () => AppState.currentState === 'active',
});

let subscriberCount = 0;
let appStateSubscription: { remove: () => void } | null = null;

export function subscribeToWaterLevelSensors(
  listener: (sensors: WaterLevelSensor[]) => void,
  onError?: (error: unknown) => void,
) {
  if (subscriberCount === 0) {
    appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void monitor.refresh();
    });
  }
  subscriberCount += 1;
  const unsubscribe = monitor.subscribe(listener, onError);

  let subscribed = true;
  return () => {
    if (!subscribed) return;
    subscribed = false;
    unsubscribe();
    subscriberCount -= 1;
    if (subscriberCount === 0) {
      appStateSubscription?.remove();
      appStateSubscription = null;
    }
  };
}

export function refreshWaterLevelSensors() {
  return monitor.refresh();
}

export function getWaterSensorMonitorDiagnostics() {
  return monitor.diagnostics();
}
