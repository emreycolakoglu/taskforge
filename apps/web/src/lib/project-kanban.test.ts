import { describe, it, expect } from 'vitest';
import type { Board, Status, Task } from '@/types';
import { applyProjectTaskMove, buildProjectColumns, isColumnDroppable } from './project-kanban';

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: 't',
    statusId: 's',
    boardId: 'b1',
    number: 1,
    taskNumber: 'TFG-0',
    title: 'Task',
    position: 0,
    priority: 'medium',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeStatus(overrides: Partial<Status>): Status {
  return { id: 's', boardId: 'b1', name: 'Todo', type: 'todo', position: 0, ...overrides };
}

const tfg: Board = {
  id: 'b1',
  name: 'Sprint',
  slug: 'sprint',
  identifier: 'TFG',
  createdAt: '2026-01-01',
  // Deliberately out of order — columns follow status position.
  statuses: [
    makeStatus({ id: 'b1-done', name: 'Done', type: 'done', position: 2 }),
    makeStatus({ id: 'b1-todo', name: 'Todo', position: 0 }),
    makeStatus({ id: 'b1-ip', name: 'In Progress', type: 'in_progress', position: 1 }),
  ],
};

const inf: Board = {
  id: 'b2',
  name: 'Infra',
  slug: 'infra',
  identifier: 'INF',
  createdAt: '2026-01-01',
  statuses: [
    makeStatus({ id: 'b2-ip', boardId: 'b2', name: 'In Progress', position: 0 }),
    makeStatus({ id: 'b2-done', boardId: 'b2', name: 'Done', type: 'done', position: 1 }),
  ],
};

const t1 = makeTask({ id: 't1', boardId: 'b1', statusId: 'b1-todo', position: 0 });
const t2 = makeTask({ id: 't2', boardId: 'b2', statusId: 'b2-ip', position: 0 });
const t3 = makeTask({ id: 't3', boardId: 'b1', statusId: 'b1-ip', position: 0 });
const t4 = makeTask({ id: 't4', boardId: 'b1', statusId: 'b1-ip', position: 1 });

describe('buildProjectColumns', () => {
  it("emits every status of each represented board, including that board's empty ones", () => {
    const columns = buildProjectColumns([t1, t2, t3, t4], [tfg, inf]);

    expect(columns.map((c) => c.id).sort()).toEqual([
      'b1-done',
      'b1-ip',
      'b1-todo',
      'b2-done',
      'b2-ip',
    ]);
    expect(columns.find((c) => c.id === 'b1-done')!.tasks).toEqual([]);
  });

  it("tags each column with its board's identifier so same-named statuses stay distinct", () => {
    const columns = buildProjectColumns([t1, t2, t3], [tfg, inf]);

    const inProgress = columns.filter((c) => c.name === 'In Progress');
    expect(inProgress.map((c) => c.boardIdentifier).sort()).toEqual(['INF', 'TFG']);
  });

  it('places tasks in their status column in payload order', () => {
    const columns = buildProjectColumns([t1, t2, t3, t4], [tfg, inf]);

    expect(columns.find((c) => c.id === 'b1-ip')!.tasks.map((t) => t.id)).toEqual(['t3', 't4']);
    expect(columns.find((c) => c.id === 'b2-ip')!.tasks.map((t) => t.id)).toEqual(['t2']);
  });

  it('interleaves boards: orders every column by status type, then position', () => {
    const columns = buildProjectColumns([t1, t2, t3, t4], [tfg, inf]);

    // b2-ip is named "In Progress" but typed todo, so it sits in the todo band.
    expect(columns.map((c) => c.id)).toEqual(['b1-todo', 'b2-ip', 'b1-ip', 'b2-done', 'b1-done']);
  });

  it('breaks type + position ties by board first appearance in the task list', () => {
    const a = makeStatus({ id: 'a-done', boardId: 'b1', type: 'done', position: 3 });
    const b = makeStatus({ id: 'b-done', boardId: 'b2', type: 'done', position: 3 });
    const boards = [
      { ...tfg, statuses: [a] },
      { ...inf, statuses: [b] },
    ];

    expect(buildProjectColumns([t2, t1], boards).map((c) => c.id)).toEqual(['b-done', 'a-done']);
    expect(buildProjectColumns([t1, t2], boards).map((c) => c.id)).toEqual(['a-done', 'b-done']);
  });

  it('omits boards with no task in the project and boards not loaded yet', () => {
    expect(buildProjectColumns([t1], [tfg, inf]).every((c) => c.boardId === 'b1')).toBe(true);
    expect(buildProjectColumns([t1, t2], [inf]).every((c) => c.boardId === 'b2')).toBe(true);
  });
});

describe('isColumnDroppable', () => {
  const column = { boardId: 'b1' };

  it('accepts any column when nothing is being dragged', () => {
    expect(isColumnDroppable(null, column)).toBe(true);
  });

  it("accepts only the dragged card's own board", () => {
    expect(isColumnDroppable('b1', column)).toBe(true);
    expect(isColumnDroppable('b2', column)).toBe(false);
  });
});

describe('applyProjectTaskMove', () => {
  const doneStatus = makeStatus({ id: 'b1-done', name: 'Done', type: 'done', position: 2 });
  const ipStatus = makeStatus({ id: 'b1-ip', name: 'In Progress', position: 1 });

  it('moves a task into an empty column with its new status and position', () => {
    const next = applyProjectTaskMove([t1, t3, t4], 't1', doneStatus, 0, 0);

    const moved = next.find((t) => t.id === 't1')!;
    expect(moved.statusId).toBe('b1-done');
    expect(moved.status?.name).toBe('Done');
    expect(moved.position).toBe(0);
  });

  it('inserts in front of the task at the destination index', () => {
    const next = applyProjectTaskMove([t1, t3, t4], 't1', ipStatus, 1, 1);

    expect(next.filter((t) => t.statusId === 'b1-ip').map((t) => t.id)).toEqual(['t3', 't1', 't4']);
  });

  it('reorders within the same column', () => {
    const next = applyProjectTaskMove([t1, t3, t4], 't4', ipStatus, 0, 0);

    expect(next.filter((t) => t.statusId === 'b1-ip').map((t) => t.id)).toEqual(['t4', 't3']);
  });

  it('does not mutate the input', () => {
    const input = [t1, t3, t4];
    applyProjectTaskMove(input, 't1', doneStatus, 0, 0);
    expect(input.map((t) => t.id)).toEqual(['t1', 't3', 't4']);
    expect(t1.statusId).toBe('b1-todo');
  });
});
