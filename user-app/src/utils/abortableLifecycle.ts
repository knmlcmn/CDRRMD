export type AbortableLifecycleHandle = {
  id: number;
  signal: AbortSignal;
  isCurrent: () => boolean;
  finish: () => void;
};

/** Owns exactly one cancellable operation and its end-to-end deadline. */
export function createAbortableLifecycle() {
  let nextId = 0;
  let active: { id: number; controller: AbortController; timeout: ReturnType<typeof setTimeout> } | null = null;

  function cancel() {
    if (!active) return false;
    const current = active;
    active = null;
    clearTimeout(current.timeout);
    current.controller.abort();
    return true;
  }

  function begin(timeoutMs: number): AbortableLifecycleHandle {
    cancel();
    const controller = new AbortController();
    const id = ++nextId;
    const timeout = setTimeout(() => {
      if (active?.id !== id) return;
      active = null;
      controller.abort();
    }, timeoutMs);
    active = { id, controller, timeout };

    return {
      id,
      signal: controller.signal,
      isCurrent: () => active?.id === id && !controller.signal.aborted,
      finish: () => {
        if (active?.id !== id) return;
        clearTimeout(active.timeout);
        active = null;
      },
    };
  }

  return {
    begin,
    cancel,
    hasActive: () => active !== null,
  };
}
