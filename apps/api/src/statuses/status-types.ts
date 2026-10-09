export const STATUS_TYPES = [
  'triage',
  'backlog',
  'todo',
  'in_progress',
  'done',
  'cancelled',
  'duplicate',
] as const;

export type StatusType = (typeof STATUS_TYPES)[number];

/**
 * Progress is no longer a per-type constant: it is computed from a status's
 * position among its same-type siblings (see StatusesService.recomputeProgress),
 * Linear-style — never 0 or 100 for in-flight types. These are the fixed
 * anchors: done is always full, cancelled/duplicate have no progress at all.
 */
const PROGRESS_BY_TYPE: Record<StatusType, number | null> = {
  triage: 0,
  backlog: 0,
  todo: 0,
  in_progress: 50,
  done: 100,
  cancelled: null,
  duplicate: null,
};

export function isTerminalType(type: string): boolean {
  return type === 'done' || type === 'cancelled' || type === 'duplicate';
}

export function stampsDoneAt(type: string): boolean {
  return type === 'done' || type === 'cancelled';
}

export function defaultProgressForType(type: string): number | null {
  return PROGRESS_BY_TYPE[type as StatusType] ?? null;
}
