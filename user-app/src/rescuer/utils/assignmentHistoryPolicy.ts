type AssignmentLifecycleRecord = {
  backup_request_id: number;
  status?: string | null;
  responder_acknowledged_at?: string | null;
  picked_up_at?: string | null;
  evacuation_area_id?: number | null;
};

function lifecycleSignature(item: AssignmentLifecycleRecord) {
  return [
    String(item.status || ''),
    String(item.responder_acknowledged_at || ''),
    String(item.picked_up_at || ''),
    String(item.evacuation_area_id || ''),
  ].join('|');
}

/** New active work does not affect history; removals and phase/status changes do. */
export function shouldRefreshAssignmentHistory(
  previous: AssignmentLifecycleRecord[] | null,
  next: AssignmentLifecycleRecord[],
) {
  if (previous === null) return false;
  const nextById = new Map(next.map((item) => [item.backup_request_id, item]));
  return previous.some((item) => {
    const updated = nextById.get(item.backup_request_id);
    return !updated || lifecycleSignature(updated) !== lifecycleSignature(item);
  });
}

export function createAssignmentScreenRequestScope() {
  let generation = 0;
  let active = false;
  return {
    activate() {
      active = true;
      generation += 1;
    },
    invalidate() {
      active = false;
      generation += 1;
    },
    capture() {
      return generation;
    },
    isCurrent(capturedGeneration: number) {
      return active && capturedGeneration === generation;
    },
  };
}
