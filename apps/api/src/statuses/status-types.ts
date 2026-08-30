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

const PROGRESS_BY_TYPE: Record<StatusType, number | null> = {
  triage: 0,
  backlog: 0,
  todo: 0,
  in_progress: 50,
  done: 100,
  cancelled: null,
  duplicate: null,
};

export function isProgressEditable(type: string): boolean {
  return type === 'triage' || type === 'in_progress';
}

export function isTerminalType(type: string): boolean {
  return type === 'done' || type === 'cancelled' || type === 'duplicate';
}

export function stampsDoneAt(type: string): boolean {
  return type === 'done' || type === 'cancelled';
}

export function defaultProgressForType(type: string): number | null {
  return PROGRESS_BY_TYPE[type as StatusType] ?? 0;
}
