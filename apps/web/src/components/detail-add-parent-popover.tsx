/**
 * DetailAddParentPopover — "Set parent" task picker.
 *
 * Thin wrapper over TaskPickerPopover: excludes self, tasks that already have a
 * parent, and this task's own sub-tasks (cycle prevention). Presentation and
 * search live in the shared picker.
 */

import { useMemo } from "react";
import { TaskPickerPopover } from "./task-picker-popover";
import type { Task } from "@/types";

interface DetailAddParentPopoverProps {
  boardTasks: Task[];
  currentTaskId: string;
  currentSubTaskIds: Set<string>;
  onAdd: (id: string) => void;
}

export function DetailAddParentPopover({
  boardTasks,
  currentTaskId,
  currentSubTaskIds,
  onAdd,
}: DetailAddParentPopoverProps) {
  const tasks = useMemo(
    () =>
      boardTasks.filter(
        (t) =>
          t.id !== currentTaskId &&
          !t.parentId &&
          !currentSubTaskIds.has(t.id),
      ),
    [boardTasks, currentTaskId, currentSubTaskIds],
  );

  return (
    <TaskPickerPopover tasks={tasks} onSelect={onAdd} triggerLabel="Set parent" />
  );
}
