/**
 * DetailAddRelationPopover — "Add relation" task picker.
 *
 * Thin wrapper over TaskPickerPopover: excludes tasks already related (or the
 * task itself). Presentation and search live in the shared picker.
 */

import { useMemo } from "react";
import { TaskPickerPopover } from "./task-picker-popover";
import type { Task } from "@/types";

interface DetailAddRelationPopoverProps {
  boardTasks: Task[];
  excludeIds: Set<string>;
  onAdd: (id: string) => void;
}

export function DetailAddRelationPopover({
  boardTasks,
  excludeIds,
  onAdd,
}: DetailAddRelationPopoverProps) {
  const tasks = useMemo(
    () => boardTasks.filter((t) => !excludeIds.has(t.id)),
    [boardTasks, excludeIds],
  );

  return <TaskPickerPopover tasks={tasks} onSelect={onAdd} triggerLabel="Add…" />;
}
