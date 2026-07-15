/**
 * TaskCard — Linear-inspired compact issue card.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ [priority-icon] TF-730  Parent task name…       [avatar] │
 *   │ Task title here that can wrap onto a                      │
 *   │ second line before being truncated…                      │
 *   │ ↳ TF-729  [label] [label] +2   💬3  ⊘2            [tag+] │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Row 1: priority icon → task number (mono) → parent task name (if any, truncate) → assignee avatar.
 * Title row: task title, clamped to two lines (weight 400).
 * Row 3 (only if metadata exists): parent ref → label pills → comments → blocked → label manager (+).
 *
 * design.md compliance: no Lime anywhere on the card. Border-defined edges
 * (Graphite inset border), no bright fills. Priority uses Crimson/Indigo —
 * accepted existing deviation (semantic signal). Inter weight 400 for the title.
 */

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Task } from "@/types";
import { CircleSmallIcon, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { LabelManager } from "./label-manager";
import { PriorityIcon } from "./priority-icons";

// ── Contrast helper ───────────────────────────────────────────────────────────

function contrastTextColor(hex: string): string {
  const hex6 = hex.replace("#", "");
  const r = parseInt(hex6.substring(0, 2), 16);
  const g = parseInt(hex6.substring(2, 4), 16);
  const b = parseInt(hex6.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#030404" : "#f7f8f8";
}

function CommentIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2 3a1 1 0 011-1h8a1 1 0 011 1v5a1 1 0 01-1 1H5l-2 2V9H3a1 1 0 01-1-1V3z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Blocked indicator — Crimson (#eb5757), per design.md semantic accent.
function BlockedIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M4.5 4.5l5 5M9.5 4.5l-5 5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

interface TaskCardProps {
  task: Task;
  isDragging?: boolean;
  boardId?: string;
  parentTaskNumber?: string;
  parentTaskName?: string;
  onAddSubTask?: () => void;
}

export function TaskCard({
  task,
  isDragging,
  boardId,
  parentTaskNumber,
  parentTaskName,
  onAddSubTask,
}: TaskCardProps) {
  const labels = task.taskLabels ?? task.labels ?? [];
  const isSubTask = !!task.parentId;

  const priorityIcon = (): ReactNode => (
    <PriorityIcon priority={task.priority} />
  );

  const visibleLabels = labels.slice(0, 2);
  const overflowCount = labels.length > 2 ? labels.length - 2 : 0;

  const hasRow2 =
    !!parentTaskNumber ||
    visibleLabels.length > 0 ||
    (task._count && task._count.comments > 0) ||
    (task.blockedByCount != null && task.blockedByCount > 0);

  return (
    <div
      className={cn(
        "group/card relative flex flex-col gap-1 rounded-md border border-border bg-card p-2.5 cursor-pointer transition-colors hover:border-foreground/20 hover:bg-accent/30",
        isDragging && "shadow-xl rotate-1",
        isSubTask && "pl-4 border-l-2 border-l-border",
      )}
    >
      {/* Row 1 — priority icon + task number + parent task name + assignee */}
      <div className="flex items-center gap-2 min-w-0">
        {priorityIcon()}
        {task.taskNumber && (
          <span className="text-xs font-mono text-muted-foreground shrink-0">
            {task.taskNumber}
          </span>
        )}
        {parentTaskName && (
          <>
            <span className="text-xs text-muted-foreground truncate">
              {">"}
            </span>
            <span
              className="text-xs text-muted-foreground truncate flex-1"
              title={parentTaskName}
            >
              {parentTaskName}
            </span>
          </>
        )}
        {task.assignee && (
          <Avatar className="size-5 ml-auto shrink-0">
            <AvatarFallback
              className="text-[9px] font-semibold"
              title={task.assignee.displayName}
            >
              {task.assignee.displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
      </div>

      {/* Title row — clamped to two lines */}
      <span className="text-sm text-foreground line-clamp-2">{task.title}</span>

      {/* Row 3 — only if metadata exists */}
      {hasRow2 && (
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs min-w-0">
          {visibleLabels.length > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              {visibleLabels.map((tl) => (
                <Badge
                  key={tl.labelId}
                  variant={"outline"}
                  style={{
                    color: contrastTextColor(tl.label.color),
                  }}
                >
                  <CircleSmallIcon
                    data-icon="inline-start"
                    style={{ color: tl.label.color, fill: tl.label.color }}
                  />
                  {tl.label.name}
                </Badge>
              ))}
              {overflowCount > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  +{overflowCount}
                </span>
              )}
            </div>
          )}

          {task._count && task._count.comments > 0 && (
            <span
              className="flex items-center gap-0.5 text-xs text-muted-foreground shrink-0"
              aria-label={`${task._count.comments} comments`}
            >
              <CommentIcon />
              {task._count.comments}
            </span>
          )}

          {task.blockedByCount != null && task.blockedByCount > 0 && (
            <span
              className="flex items-center gap-0.5 text-xs text-[#eb5757] shrink-0"
              title={`Blocked by ${task.blockedByCount} task(s)`}
              aria-label={`Blocked by ${task.blockedByCount} task(s)`}
            >
              <BlockedIcon />
              {task.blockedByCount}
            </span>
          )}

          {/* Label manager (+) — hover-revealed, far right */}
          {boardId && (
            <div className="opacity-0 group-hover/card:opacity-100 transition-opacity ml-auto shrink-0">
              <LabelManager task={task} boardId={boardId} />
            </div>
          )}
        </div>
      )}

      {/* Sub-task hover + — lives on the card, far right of row 1 area */}
      {onAddSubTask && (
        <button
          className="absolute top-1 right-1 opacity-0 group-hover/card:opacity-100 transition-opacity size-5 rounded bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent flex items-center justify-center"
          aria-label="Add sub-task"
          title="Add sub-task"
          onClick={(e) => {
            e.stopPropagation();
            onAddSubTask();
          }}
        >
          <Plus className="size-3" />
        </button>
      )}
    </div>
  );
}
