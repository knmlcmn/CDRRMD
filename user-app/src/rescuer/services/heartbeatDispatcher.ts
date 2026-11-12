import { createSingleFlight } from '../../utils/singleFlight.ts';

/**
 * Keeps heartbeat lifecycle policy at the network boundary. Callers may race
 * (for example, an overdue interval and an AppState resume callback), but only
 * one foreground request is allowed to run at a time.
 */
export function createHeartbeatDispatcher<T>(
  send: () => Promise<T>,
  isForeground: () => boolean,
) {
  const singleFlight = createSingleFlight<T | null>();

  return {
    trigger(): Promise<T | null> {
      if (!isForeground()) return Promise.resolve(null);
      return singleFlight.run(() => (isForeground() ? send() : Promise.resolve(null)));
    },
  };
}
