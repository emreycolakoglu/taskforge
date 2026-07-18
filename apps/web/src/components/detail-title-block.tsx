/**
 * DetailTitleBlock — priority icon + editable title + parent reference line.
 *
 * Title is large (24px, weight 510, tracking-tight per --text-heading-sm),
 * click-to-edit, Enter commits, Escape cancels. The task identifier lives in
 * the breadcrumb bar, not here. Priority icon sits inline-left of the title
 * (Linear pattern). Parent reference line below: "Sub-issue of TF-267".
 */

import { useState } from "react";
import { PriorityIcon } from "./priority-icons";
import { Input } from "@/components/ui/input";
import type { Task } from "@/types";

interface DetailTitleBlockProps {
  task: Task;
  onSaveTitle: (title: string) => void;
  onNavigateParent: (id: string) => void;
}

export function DetailTitleBlock({
  task,
  onSaveTitle,
  onNavigateParent,
}: DetailTitleBlockProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);

  const startEdit = () => {
    setDraft(task.title);
    setEditing(true);
  };

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== task.title) {
      onSaveTitle(trimmed);
    }
    setEditing(false);
  };

  const cancel = () => {
    setDraft(task.title);
    setEditing(false);
  };

  const parentNumber = task.parent?.board?.identifier
    ? `${task.parent.board.identifier}-${task.parent.number}`
    : task.parent
      ? `#${task.parent.number}`
      : null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <PriorityIcon priority={task.priority} size={20} />
        {editing ? (
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") cancel();
            }}
            className="flex-1 h-auto -mx-2 px-2 py-1 text-[24px] font-medium tracking-tight"
          />
        ) : (
          <h1
            className="flex-1 text-[24px] font-medium tracking-tight text-foreground cursor-text hover:bg-accent/30 rounded-md px-2 -mx-2 py-1"
            onClick={startEdit}
          >
            {task.title}
          </h1>
        )}
      </div>
      {task.parent && parentNumber && (
        <p className="text-xs text-muted-foreground pl-6">
          Sub-issue of{" "}
          <button
            className="font-mono text-muted-foreground hover:text-foreground hover:underline"
            onClick={() => onNavigateParent(task.parent!.id)}
          >
            {parentNumber}
          </button>
        </p>
      )}
    </div>
  );
}
