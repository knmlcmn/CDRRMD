type Listener<T> = (value: T) => void;
type ErrorListener = (error: unknown) => void;

type SharedPollerOptions<T> = {
  load: () => Promise<T>;
  signature: (value: T) => string;
  intervalMs: number;
  isActive?: () => boolean;
  setIntervalFn?: (callback: () => void, intervalMs: number) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (timer: ReturnType<typeof setInterval>) => void;
};

/** A reference-counted poller: any number of consumers share one request loop. */
export function createSharedPoller<T>({
  load,
  signature,
  intervalMs,
  isActive = () => true,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}: SharedPollerOptions<T>) {
  const listeners = new Set<Listener<T>>();
  const errorListeners = new Set<ErrorListener>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight: Promise<T | null> | null = null;
  let currentValue: T | null = null;
  let currentSignature = '';

  async function refresh() {
    if (!isActive()) return currentValue;
    if (inFlight) return inFlight;

    inFlight = load()
      .then((nextValue) => {
        const nextSignature = signature(nextValue);
        if (currentValue === null || nextSignature !== currentSignature) {
          currentValue = nextValue;
          currentSignature = nextSignature;
          listeners.forEach((listener) => listener(nextValue));
        }
        return currentValue;
      })
      .catch((error: unknown) => {
        errorListeners.forEach((listener) => listener(error));
        return currentValue;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  function start() {
    if (timer !== null) return;
    void refresh();
    timer = setIntervalFn(() => void refresh(), intervalMs);
  }

  function stop() {
    if (timer === null) return;
    clearIntervalFn(timer);
    timer = null;
  }

  function subscribe(listener: Listener<T>, onError?: ErrorListener) {
    listeners.add(listener);
    if (onError) errorListeners.add(onError);
    if (currentValue !== null) listener(currentValue);
    start();

    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      listeners.delete(listener);
      if (onError) errorListeners.delete(onError);
      if (listeners.size === 0) stop();
    };
  }

  return {
    subscribe,
    refresh,
    diagnostics: () => ({
      subscriberCount: listeners.size,
      polling: timer !== null,
      requestInFlight: inFlight !== null,
    }),
  };
}
