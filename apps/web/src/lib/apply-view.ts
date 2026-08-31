import type { Label, Status, Task, ViewGroupBy, ViewSortBy } from '@/types';

export interface ViewFilterState {
  labelIds: string[];
  assigneeIds: string[];
  priorities: ('low' | 'medium' | 'high' | 'urgent')[];
  dueDateRange: { from: string | null; to: string | null };
  searchQuery: string;
}

export const DEFAULT_FILTER_STATE: ViewFilterState = {
  labelIds: [],
  assigneeIds: [],
  priorities: [],
  dueDateRange: { from: null, to: null },
  searchQuery: '',
};

export function taskLabelIds(t: Task): string[] {
  return ((t as any).taskLabels ?? t.labels ?? []).map((tl: any) => tl.labelId);
}

export function applyViewFilters(task: Task, f: ViewFilterState): boolean {
  if (f.labelIds.length > 0) {
    const have = taskLabelIds(task);
    if (!f.labelIds.every((id) => have.includes(id))) return false;
  }
  if (f.assigneeIds.length > 0 && !f.assigneeIds.includes(task.assigneeId ?? '')) return false;
  if (f.priorities.length > 0 && !f.priorities.includes(task.priority)) return false;
  const { from, to } = f.dueDateRange;
  if (from || to) {
    if (!task.dueDate) return false;
    if (from && task.dueDate < from) return false;
    if (to && task.dueDate > to) return false;
  }
  if (f.searchQuery && !task.title.toLowerCase().includes(f.searchQuery.toLowerCase())) {
    return false;
  }
  return true;
}

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 } as const;

export function sortTasks(tasks: Task[], sortBy: ViewSortBy): Task[] {
  const sorted = [...tasks];
  switch (sortBy) {
    case 'priority':
      return sorted.sort(
        (a, b) => (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99),
      );
    case 'dueDate':
      return sorted.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
    case 'title':
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
    default:
      return sorted.sort((a, b) => a.position - b.position);
  }
}

const PRIORITY_GROUP_ORDER = ['urgent', 'high', 'medium', 'low'] as const;

export interface TaskGroup {
  id: string;
  name: string;
  type: string;
  position: number;
  tasks: Task[];
}

export function groupTasksBy(
  tasks: Task[],
  statuses: Status[],
  groupBy: ViewGroupBy,
  labels?: Label[],
): TaskGroup[] {
  if (groupBy === 'none') {
    return [{ id: 'none', name: 'All tasks', type: 'todo', position: 0, tasks }];
  }

  if (groupBy === 'status') {
    return statuses.map((s) => ({ ...s, tasks: tasks.filter((t) => t.statusId === s.id) }));
  }

  if (groupBy === 'priority') {
    const groups: TaskGroup[] = [];
    PRIORITY_GROUP_ORDER.forEach((p, i) => {
      const inGroup = tasks.filter((t) => t.priority === p);
      if (inGroup.length > 0) {
        groups.push({ id: `priority-${p}`, name: p, type: 'todo', position: i, tasks: inGroup });
      }
    });
    return groups;
  }

  if (groupBy === 'assignee') {
    const assigneeKey = (t: Task): string | null => t.assigneeId ?? t.assignee?.id ?? null;
    const byAssignee = new Map<string, { name: string; tasks: Task[] }>();
    for (const t of tasks) {
      const key = assigneeKey(t);
      if (!key) continue;
      if (!byAssignee.has(key)) {
        byAssignee.set(key, { name: t.assignee?.displayName ?? 'Unknown', tasks: [] });
      }
      byAssignee.get(key)!.tasks.push(t);
    }
    const groups: TaskGroup[] = [];
    for (const [key, group] of byAssignee) {
      groups.push({
        id: `assignee-${key}`,
        name: group.name,
        type: 'todo',
        position: groups.length,
        tasks: group.tasks,
      });
    }
    const unassigned = tasks.filter((t) => !assigneeKey(t));
    if (unassigned.length > 0) {
      groups.push({
        id: 'no-assignee',
        name: 'No assignee',
        type: 'backlog',
        position: groups.length,
        tasks: unassigned,
      });
    }
    return groups;
  }

  // groupBy === 'label': one column per label id present on any task,
  // "No label" fallback only when unlabeled tasks exist.
  const labelNames = new Map((labels ?? []).map((l) => [l.id, l.name]));
  const byLabel = new Map<string, Task[]>();
  for (const t of tasks) {
    for (const id of taskLabelIds(t)) {
      if (!byLabel.has(id)) byLabel.set(id, []);
      byLabel.get(id)!.push(t);
    }
  }
  const groups: TaskGroup[] = [];
  for (const [key, group] of byLabel) {
    groups.push({
      id: `label-${key}`,
      name: labelNames.get(key) ?? key,
      type: 'todo',
      position: groups.length,
      tasks: group,
    });
  }
  const unlabeled = tasks.filter((t) => taskLabelIds(t).length === 0);
  if (unlabeled.length > 0) {
    groups.push({
      id: 'no-label',
      name: 'No label',
      type: 'backlog',
      position: groups.length,
      tasks: unlabeled,
    });
  }
  return groups;
}
