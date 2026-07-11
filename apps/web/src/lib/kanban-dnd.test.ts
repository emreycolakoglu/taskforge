import { describe, it, expect } from 'vitest'
import type { DropResult } from '@hello-pangea/dnd'
import type { Status, Task } from '@/types'
import { planTaskMove } from './kanban-dnd'

function task(id: string, statusId: string, position: number): Task {
  return {
    id,
    statusId,
    boardId: 'b1',
    number: position,
    taskNumber: `T-${id}`,
    title: `Task ${id}`,
    position,
    priority: 'medium',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function columns(): Status[] {
  return [
    {
      id: 'todo',
      boardId: 'b1',
      name: 'Todo',
      position: 0,
      tasks: [task('a', 'todo', 0), task('b', 'todo', 1), task('c', 'todo', 2)],
    },
    {
      id: 'doing',
      boardId: 'b1',
      name: 'Doing',
      position: 1,
      tasks: [task('x', 'doing', 0), task('y', 'doing', 1)],
    },
  ]
}

/** Keep only the given task ids visible in each column (simulates a label filter). */
function filterVisible(statuses: Status[], visibleIds: string[]): Status[] {
  return statuses.map((s) => ({
    ...s,
    tasks: (s.tasks || []).filter((t) => visibleIds.includes(t.id)),
  }))
}

function drop(
  draggableId: string,
  from: [string, number],
  to: [string, number],
): DropResult {
  return {
    draggableId,
    type: 'DEFAULT',
    reason: 'DROP',
    mode: 'FLUID',
    source: { droppableId: from[0], index: from[1] },
    destination: { droppableId: to[0], index: to[1] },
    combine: null,
  } as DropResult
}

describe('planTaskMove (unfiltered)', () => {
  it('returns null when dropped outside a droppable', () => {
    const cols = columns()
    const result = { ...drop('a', ['todo', 0], ['todo', 1]), destination: null } as DropResult
    expect(planTaskMove(cols, cols, result)).toBeNull()
  })

  it('returns null when dropped in the same position', () => {
    const cols = columns()
    expect(planTaskMove(cols, cols, drop('a', ['todo', 1], ['todo', 1]))).toBeNull()
  })

  it('reorders within a column and renumbers positions', () => {
    const cols = columns()
    const plan = planTaskMove(cols, cols, drop('a', ['todo', 0], ['todo', 2]))
    expect(plan?.kind).toBe('reorder')
    if (plan?.kind !== 'reorder') throw new Error('expected reorder')
    const todo = plan.statuses.find((s) => s.id === 'todo')!
    expect(todo.tasks!.map((t) => t.id)).toEqual(['b', 'c', 'a'])
    expect(plan.items).toEqual([
      { id: 'b', position: 0 },
      { id: 'c', position: 1 },
      { id: 'a', position: 2 },
    ])
  })

  it('moves a task across columns and updates its statusId', () => {
    const cols = columns()
    const plan = planTaskMove(cols, cols, drop('a', ['todo', 0], ['doing', 1]))
    expect(plan?.kind).toBe('move')
    if (plan?.kind !== 'move') throw new Error('expected move')
    const todo = plan.statuses.find((s) => s.id === 'todo')!
    const doing = plan.statuses.find((s) => s.id === 'doing')!
    expect(todo.tasks!.map((t) => t.id)).toEqual(['b', 'c'])
    expect(doing.tasks!.map((t) => t.id)).toEqual(['x', 'a', 'y'])
    expect(doing.tasks!.find((t) => t.id === 'a')!.statusId).toBe('doing')
    expect(plan.taskId).toBe('a')
    expect(plan.statusId).toBe('doing')
    expect(plan.position).toBe(1)
  })

  it('appends to the end of a column when dropped past the last task', () => {
    const cols = columns()
    const plan = planTaskMove(cols, cols, drop('a', ['todo', 0], ['doing', 2]))
    if (plan?.kind !== 'move') throw new Error('expected move')
    const doing = plan.statuses.find((s) => s.id === 'doing')!
    expect(doing.tasks!.map((t) => t.id)).toEqual(['x', 'y', 'a'])
    expect(plan.position).toBe(2)
  })

  it('does not mutate the input columns', () => {
    const cols = columns()
    const snapshot = JSON.stringify(cols)
    planTaskMove(cols, cols, drop('a', ['todo', 0], ['doing', 1]))
    expect(JSON.stringify(cols)).toBe(snapshot)
  })
})

describe('planTaskMove (with an active filter)', () => {
  // Full todo = [a, b, c] but only [a, c] visible (b filtered out).
  it('reorders using the visible neighbour while keeping hidden tasks in place', () => {
    const cols = columns()
    const visible = filterVisible(cols, ['a', 'c', 'x', 'y'])
    // Visible todo is [a, c]; drag `a` after `c` (visible index 1).
    const plan = planTaskMove(cols, visible, drop('a', ['todo', 0], ['todo', 1]))
    if (plan?.kind !== 'reorder') throw new Error('expected reorder')
    const todo = plan.statuses.find((s) => s.id === 'todo')!
    // Hidden `b` stays before `c`; `a` lands after `c`.
    expect(todo.tasks!.map((t) => t.id)).toEqual(['b', 'c', 'a'])
  })

  it('inserts before the visible anchor, not the raw filtered index', () => {
    const cols = columns()
    // Full doing = [x, y]; hide `x` so only [y] is visible.
    const visible = filterVisible(cols, ['a', 'b', 'c', 'y'])
    // Visible doing is [y]; drop `a` before `y` (visible index 0).
    const plan = planTaskMove(cols, visible, drop('a', ['todo', 0], ['doing', 0]))
    if (plan?.kind !== 'move') throw new Error('expected move')
    const doing = plan.statuses.find((s) => s.id === 'doing')!
    // Hidden `x` stays first; `a` lands immediately before visible `y`.
    expect(doing.tasks!.map((t) => t.id)).toEqual(['x', 'a', 'y'])
  })

  it('drops after the last visible task, ahead of trailing hidden tasks', () => {
    const cols = columns()
    // Full doing = [x, y]; hide `y` so only [x] is visible.
    const visible = filterVisible(cols, ['a', 'b', 'c', 'x'])
    // Visible doing is [x]; drop `a` at the end (visible index 1).
    const plan = planTaskMove(cols, visible, drop('a', ['todo', 0], ['doing', 1]))
    if (plan?.kind !== 'move') throw new Error('expected move')
    const doing = plan.statuses.find((s) => s.id === 'doing')!
    // `a` lands after visible `x` but before hidden `y`.
    expect(doing.tasks!.map((t) => t.id)).toEqual(['x', 'a', 'y'])
  })

  it('appends to the end when the target column has no visible tasks', () => {
    const cols = columns()
    // Hide everything in doing.
    const visible = filterVisible(cols, ['a', 'b', 'c'])
    const plan = planTaskMove(cols, visible, drop('a', ['todo', 0], ['doing', 0]))
    if (plan?.kind !== 'move') throw new Error('expected move')
    const doing = plan.statuses.find((s) => s.id === 'doing')!
    expect(doing.tasks!.map((t) => t.id)).toEqual(['x', 'y', 'a'])
  })
})
