import type { StatusType } from '@/types';

// Progress is computed server-side from the status's position among its
// same-type siblings (Linear-style — never 0 or 100 for in-flight types).
// These are the fixed anchors: done is always full, cancelled/duplicate have
// no progress at all.
const PROGRESS_BY_TYPE: Record<StatusType, number | null> = {
  triage: 0,
  backlog: 0,
  todo: 0,
  in_progress: 50,
  done: 100,
  cancelled: null,
  duplicate: null,
};

export function defaultProgressForType(type: StatusType): number | null {
  return PROGRESS_BY_TYPE[type] ?? 0;
}

export function isTerminalType(type: StatusType): boolean {
  return type === 'done' || type === 'cancelled' || type === 'duplicate';
}

export function stampsDoneAt(type: StatusType): boolean {
  return type === 'done' || type === 'cancelled';
}
