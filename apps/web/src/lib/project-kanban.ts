import type { Board, Status, Task } from '@/types';

/**
 * Pure helpers behind the project kanban (Projects v2 §4).
 *
 * A project's tasks can span boards, but a task can only ever sit in a status
 * of its OWN board (cross-board drops are blocked — task numbers, labels and
 * doc numbers are board-scoped). So the board renders one column per status
 * of every represented board, tagged with that board's identifier, and only
 * the dragged card's own board's columns accept the drop.
 */

/** A status column holding only the project's tasks, tagged with its board. */
export interface ProjectColumn extends Status {
  boardIdentifier: string;
  tasks: Task[];
}

/**
 * One column per status of every board with at least one task in the
 * project — including that board's empty statuses, otherwise a card could
 * never be dropped into its own board's empty "Done". Boards are ordered by
 * first appearance in `tasks`; statuses by position within the board. Tasks
 * keep payload order inside a column. Boards not in `boards` (not loaded yet)
 * are skipped.
 */
export function buildProjectColumns(tasks: Task[], boards: Board[]): ProjectColumn[] {
  const boardById = new Map(boards.map((b) => [b.id, b]));
  const boardOrder = [...new Set(tasks.map((t) => t.boardId))];

  return boardOrder.flatMap((boardId) => {
    const board = boardById.get(boardId);
    if (!board) return [];
    return [...(board.statuses ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((status) => ({
        ...status,
        boardIdentifier: board.identifier,
        tasks: tasks.filter((t) => t.statusId === status.id),
      }));
  });
}

/** Whether `column` accepts the card being dragged (null = no drag in progress). */
export function isColumnDroppable(
  draggingBoardId: string | null,
  column: { boardId: string },
): boolean {
  return draggingBoardId === null || column.boardId === draggingBoardId;
}

/**
 * Optimistic copy of the project's task list with `taskId` moved into
 * `status` at `destinationIndex` of that column's project tasks. Columns are
 * built from list order, so the task is re-inserted in front of the task it
 * lands on (or after the column's last task).
 */
export function applyProjectTaskMove(
  tasks: Task[],
  taskId: string,
  status: Status,
  destinationIndex: number,
  position: number,
): Task[] {
  const moving = tasks.find((t) => t.id === taskId);
  if (!moving) return tasks;
  const moved: Task = {
    ...moving,
    statusId: status.id,
    status: { ...status, tasks: undefined },
    position,
  };

  const rest = tasks.filter((t) => t.id !== taskId);
  const column = rest.filter((t) => t.statusId === status.id);
  const anchor = column[destinationIndex];
  const last = column[column.length - 1];
  const insertAt = anchor ? rest.indexOf(anchor) : last ? rest.indexOf(last) + 1 : rest.length;

  return [...rest.slice(0, insertAt), moved, ...rest.slice(insertAt)];
}
