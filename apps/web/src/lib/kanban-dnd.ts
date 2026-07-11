import type { DropResult } from '@hello-pangea/dnd'
import type { Status } from '@/types'

/**
 * Result of computing a drag-and-drop move against the current board columns.
 *
 * - `statuses` is a fresh copy of the (unfiltered) columns with the task moved
 *   into place, ready to hand to `queryClient.setQueryData` for optimistic
 *   rendering.
 * - The remaining fields describe the API call the caller must fire to persist
 *   the move (`reorder` within a column, `move` across columns).
 *
 * Returns `null` when the drop is a no-op or references a column/task that no
 * longer exists — the caller should simply do nothing in that case.
 */
export type MovePlan =
  | { kind: 'reorder'; statuses: Status[]; items: { id: string; position: number }[] }
  | { kind: 'move'; statuses: Status[]; taskId: string; statusId: string; position: number }

/** Shallow-clone the columns so we never mutate the cached query data. */
function cloneStatuses(statuses: Status[]): Status[] {
  return statuses.map((s) => ({ ...s, tasks: s.tasks ? [...s.tasks] : s.tasks }))
}

/**
 * Translate a drop index from the *visible* (filtered) task list into an
 * insertion index in the *full* (unfiltered) column, so hidden tasks keep
 * their relative order.
 *
 * `dnd` reports `destination.index` against the list as rendered — which, when
 * a label filter is active, only contains the visible tasks. We anchor on the
 * visible task the card lands in front of and find that anchor's real index in
 * the full column. When the card lands after the last visible task we insert
 * right after it (ahead of any trailing hidden tasks); an empty visible list
 * means "append to the end".
 */
function fullInsertIndex(
  fullTasks: Status['tasks'],
  visibleIdsWithoutMoved: string[],
  destinationIndex: number,
): number {
  const tasks = fullTasks ?? []
  const anchorId = visibleIdsWithoutMoved[destinationIndex]
  if (anchorId !== undefined) {
    return tasks.findIndex((t) => t.id === anchorId)
  }
  const lastVisibleId = visibleIdsWithoutMoved[visibleIdsWithoutMoved.length - 1]
  if (lastVisibleId === undefined) return tasks.length
  return tasks.findIndex((t) => t.id === lastVisibleId) + 1
}

/**
 * Pure computation of a kanban drag result: produces the new column ordering
 * and the payload needed to persist it. Keeping this side-effect free lets us
 * unit test the reordering math and reuse it for optimistic UI updates.
 *
 * @param statuses         the full, unfiltered columns (source of truth / cache shape)
 * @param filteredStatuses the columns as rendered — `dnd` indices are relative to these
 */
export function planTaskMove(
  statuses: Status[],
  filteredStatuses: Status[],
  result: DropResult,
): MovePlan | null {
  const { draggableId, source, destination } = result
  if (!destination) return null

  const sameColumn = source.droppableId === destination.droppableId
  if (sameColumn && source.index === destination.index) return null

  const next = cloneStatuses(statuses)
  const sourceCol = next.find((s) => s.id === source.droppableId)
  const targetCol = next.find((s) => s.id === destination.droppableId)
  if (!sourceCol?.tasks || !targetCol) return null
  if (!targetCol.tasks) targetCol.tasks = []

  // Identify the dragged task by id (robust to filtering) and pull it out.
  const fromIndex = sourceCol.tasks.findIndex((t) => t.id === draggableId)
  if (fromIndex === -1) return null
  const [moved] = sourceCol.tasks.splice(fromIndex, 1)

  // Visible target tasks, excluding the dragged one, in render order.
  const visibleIdsWithoutMoved = (
    filteredStatuses.find((s) => s.id === destination.droppableId)?.tasks ?? []
  )
    .filter((t) => t.id !== draggableId)
    .map((t) => t.id)

  const insertAt = fullInsertIndex(targetCol.tasks, visibleIdsWithoutMoved, destination.index)

  if (sameColumn) {
    // `sourceCol` and `targetCol` are the same array; `moved` is already removed.
    targetCol.tasks.splice(insertAt, 0, moved)
    const items = targetCol.tasks.map((t, i) => ({ id: t.id, position: i }))
    return { kind: 'reorder', statuses: next, items }
  }

  // Cross-column: derive a target position from the neighbours (matching the
  // backend's non-reshuffling `move` semantics) before inserting.
  const targetTasks = targetCol.tasks
  const position =
    insertAt < targetTasks.length
      ? targetTasks[insertAt].position
      : targetTasks.length > 0
        ? targetTasks[targetTasks.length - 1].position + 1
        : 0

  targetTasks.splice(insertAt, 0, { ...moved, statusId: destination.droppableId })

  return { kind: 'move', statuses: next, taskId: draggableId, statusId: destination.droppableId, position }
}
