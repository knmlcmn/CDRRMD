/** Coalesces overlapping calls while allowing the next call after settlement to run normally. */
export function createSingleFlight<T>() {
  let inFlight: Promise<T> | null = null;

  return {
    run(load: () => Promise<T>): Promise<T> {
      if (inFlight) return inFlight;

      const request = Promise.resolve().then(load);
      inFlight = request;
      const clear = () => {
        if (inFlight === request) inFlight = null;
      };
      void request.then(clear, clear);
      return request;
    },
  };
}
