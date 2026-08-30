import type { StatusType } from '@/types';

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

export function isProgressEditable(type: StatusType): boolean {
  return type === 'triage' || type === 'in_progress';
}

export function isTerminalType(type: StatusType): boolean {
  return type === 'done' || type === 'cancelled' || type === 'duplicate';
}

export function stampsDoneAt(type: StatusType): boolean {
  return type === 'done' || type === 'cancelled';
}
