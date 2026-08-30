export interface DefaultStatus {
  name: string;
  type: string;
  position: number;
  color: string;
  progress: number | null;
}

export const DEFAULT_STATUSES: DefaultStatus[] = [
  { name: 'Backlog', type: 'backlog', position: 0, color: '#94a3b8', progress: 0 },
  { name: 'Todo', type: 'todo', position: 1, color: '#6366f1', progress: 0 },
  { name: 'In Progress', type: 'in_progress', position: 2, color: '#f59e0b', progress: 50 },
  { name: 'Done', type: 'done', position: 3, color: '#22c55e', progress: 100 },
  { name: 'Cancelled', type: 'cancelled', position: 4, color: '#64748b', progress: null },
  { name: 'Duplicate', type: 'duplicate', position: 5, color: '#64748b', progress: null },
];
