import { describe, expect, it } from 'vitest';
import {
  applyViewFilters,
  groupTasksBy,
  sortTasks,
  DEFAULT_FILTER_STATE,
  type ViewFilterState,
} from './apply-view';
import type { Task, Status, Label } from '@/types';

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    statusId: 's1',
    boardId: 'b1',
    number: 1,
    taskNumber: 'TFG-1',
    title: 'Task one',
    position: 0,
    priority: 'medium',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Task;
}

const statuses = [
  { id: 's1', name: 'Todo', type: 'todo', position: 0, tasks: [] },
  { id: 's2', name: 'Done', type: 'done', position: 1, tasks: [] },
] as unknown as Status[];

describe('applyViewFilters', () => {
  const empty = DEFAULT_FILTER_STATE;

  it('passes everything on default state', () => {
    expect(applyViewFilters(task(), empty)).toBe(true);
  });

  it('filters by priority list', () => {
    const state: ViewFilterState = {
      ...empty,
      priorities: ['urgent'],
    };
    expect(applyViewFilters(task({ priority: 'urgent' }), state)).toBe(true);
    expect(applyViewFilters(task({ priority: 'low' }), state)).toBe(false);
  });

  it('requires ALL label ids', () => {
    const state = { ...empty, labelIds: ['l1', 'l2'] };
    const t = task({
      labels: [
        { taskId: 't1', labelId: 'l1', label: {} as any, assignedAt: '' },
        { taskId: 't1', labelId: 'l2', label: {} as any, assignedAt: '' },
      ],
    });
    expect(applyViewFilters(t, state)).toBe(true);
    expect(
      applyViewFilters(
        task({ labels: [{ taskId: 't1', labelId: 'l1', label: {} as any, assignedAt: '' }] }),
        state,
      ),
    ).toBe(false);
  });

  it('filters by assignee', () => {
    const state = { ...empty, assigneeIds: ['u1'] };
    expect(applyViewFilters(task({ assigneeId: 'u1' }), state)).toBe(true);
    expect(applyViewFilters(task({ assigneeId: 'u2' }), state)).toBe(false);
    expect(applyViewFilters(task({}), state)).toBe(false);
  });

  it('matches search query case-insensitively on title', () => {
    const state = { ...empty, searchQuery: 'URGENT' };
    expect(applyViewFilters(task({ title: 'Fix the urgent bug' }), state)).toBe(true);
    expect(applyViewFilters(task({ title: 'Ship it' }), state)).toBe(false);
  });

  it('dueDateRange: from/to bounds are inclusive; empty passes', () => {
    const state = {
      ...empty,
      dueDateRange: { from: '2026-01-02T00:00:00.000Z', to: '2026-01-04T00:00:00.000Z' },
    };
    expect(applyViewFilters(task({ dueDate: '2026-01-03T00:00:00.000Z' }), state)).toBe(true);
    expect(applyViewFilters(task({ dueDate: '2026-01-02T00:00:00.000Z' }), state)).toBe(true);
    expect(applyViewFilters(task({ dueDate: '2026-01-04T00:00:00.000Z' }), state)).toBe(true);
    expect(applyViewFilters(task({ dueDate: '2026-01-01T00:00:00.000Z' }), state)).toBe(false);
    expect(applyViewFilters(task({ dueDate: '2026-01-05T00:00:00.000Z' }), state)).toBe(false);
    expect(applyViewFilters(task({}), state)).toBe(false);
    expect(applyViewFilters(task(), { ...empty, dueDateRange: { from: null, to: null } })).toBe(
      true,
    );
  });
});

describe('groupTasksBy', () => {
  it('status: spreads real status rows with their filtered tasks', () => {
    const a = task({ statusId: 's1' });
    const b = task({ statusId: 's2' });
    const grouped = groupTasksBy([a, b], statuses, 'status');
    expect(grouped.map((g) => g.name)).toEqual(['Todo', 'Done']);
    expect(grouped[0].tasks).toEqual([a]);
    expect(grouped[1].tasks).toEqual([b]);
  });

  it('groups by assignee: assignees in first-appearance order, No-assignee fallback last', () => {
    const a = { ...task(), id: 't1', assignee: { id: 'u1', displayName: 'Ada' } } as Task;
    const b = { ...task(), id: 't2' } as Task;
    const grouped = groupTasksBy([a, b], statuses, 'assignee');
    expect(grouped.map((g) => g.name)).toEqual(['Ada', 'No assignee']);
    expect(grouped[0].tasks).toHaveLength(1);
    expect(grouped[1].tasks).toHaveLength(1);
  });

  it('assignee: No-assignee fallback only appears when unassigned tasks exist', () => {
    const a = { ...task(), assignee: { id: 'u1', displayName: 'Ada' } } as Task;
    expect(groupTasksBy([a], statuses, 'assignee').map((g) => g.name)).toEqual(['Ada']);
    expect(groupTasksBy([task()], statuses, 'assignee').map((g) => g.name)).toEqual([
      'No assignee',
    ]);
  });

  it('groups by priority in canonical order with no fallback column', () => {
    const grouped = groupTasksBy(
      [task({ priority: 'low' }), task({ priority: 'urgent' })],
      statuses,
      'priority',
    );
    expect(grouped.map((g) => g.name)).toEqual(['urgent', 'low']);
    expect(grouped[0].tasks).toHaveLength(1);
    expect(grouped[1].tasks).toHaveLength(1);
  });

  it('groups by label using label names from the provided labels list', () => {
    const labels = [
      { id: 'l1', name: 'Bug' },
      { id: 'l2', name: 'Feature' },
    ] as Label[];
    const withL1 = task({
      id: 't1',
      labels: [{ taskId: 't1', labelId: 'l1', label: {} as any, assignedAt: '' }],
    });
    const withL2 = task({
      id: 't2',
      labels: [{ taskId: 't2', labelId: 'l2', label: {} as any, assignedAt: '' }],
    });
    const bare = task({ id: 't3' });
    const grouped = groupTasksBy([withL1, withL2, bare], statuses, 'label', labels);
    expect(grouped.map((g) => g.name)).toEqual(['Bug', 'Feature', 'No label']);
    expect(grouped[0].tasks).toEqual([withL1]);
  });

  it('label: falls back to raw id when label not found in the list', () => {
    const t = task({ labels: [{ taskId: 't1', labelId: 'lx', label: {} as any, assignedAt: '' }] });
    expect(groupTasksBy([t, task({ id: 't2' })], statuses, 'label').map((g) => g.name)).toEqual([
      'lx',
      'No label',
    ]);
  });

  it('none returns a single group with all tasks', () => {
    const grouped = groupTasksBy([task(), task({ id: 't2' })], statuses, 'none');
    expect(grouped).toHaveLength(1);
    expect(grouped[0].tasks).toHaveLength(2);
  });
});

describe('sortTasks', () => {
  it('sorts by position within group', () => {
    const sorted = sortTasks([task({ position: 2 }), task({ position: 1 })], 'position');
    expect(sorted.map((t) => t.position)).toEqual([1, 2]);
  });

  it('sorts by dueDate with null last', () => {
    const sorted = sortTasks(
      [
        task({ dueDate: undefined }),
        task({ dueDate: '2026-02-01T00:00:00.000Z' }),
        task({ dueDate: '2026-01-01T00:00:00.000Z' }),
      ],
      'dueDate',
    );
    expect(sorted[sorted.length - 1].dueDate).toBeUndefined();
  });

  it('sorts by dueDate accepting null and undefined', () => {
    const sorted = sortTasks(
      [
        task({ dueDate: null as unknown as undefined }),
        task({ dueDate: '2026-02-01T00:00:00.000Z' }),
      ],
      'dueDate',
    );
    expect(sorted[sorted.length - 1].dueDate).toBeNull();
  });

  it('sorts by priority in canonical order', () => {
    const sorted = sortTasks(
      [task({ priority: 'low' }), task({ priority: 'urgent' }), task({ priority: 'high' })],
      'priority',
    );
    expect(sorted.map((t) => t.priority)).toEqual(['urgent', 'high', 'low']);
  });

  it('sorts by title', () => {
    const sorted = sortTasks([task({ title: 'Banana' }), task({ title: 'Apple' })], 'title');
    expect(sorted.map((t) => t.title)).toEqual(['Apple', 'Banana']);
  });
});
