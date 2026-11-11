/** Shares one in-flight operation only within the same authenticated session scope. */
export function createSessionScopedSingleFlight<T>() {
  let flight: { scope: number; promise: Promise<T> } | null = null;

  function run(scope: number, operation: () => Promise<T>) {
    if (flight?.scope === scope) return flight.promise;
    const request = Promise.resolve().then(operation);
    const tracked = request.finally(() => {
      if (flight?.promise === tracked) flight = null;
    });
    flight = { scope, promise: tracked };
    return tracked;
  }

  return {
    run,
    has: (scope: number) => flight?.scope === scope,
    current: (scope: number) => flight?.scope === scope ? flight.promise : null,
  };
}
