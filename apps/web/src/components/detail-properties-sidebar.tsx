/**
 * DetailPropertiesSidebar — right sidebar properties panel.
 *
 * Flat list of property rows, no card chrome, hairline dividers between groups.
 * Each row is label (muted, sentence case per conflict register #9) → control.
 * Groups: Status & ownership, Organization, Relations, Dates.
 * Relations live here (not the main column), matching the Linear reference —
 * the group is fully interactive (add via popover, remove, navigate).
 *
 * design.md: w-[260px], bg-secondary, border-l, independent ScrollArea.
 */

import { ScrollArea } from "@/components/ui/scroll-area";
import type { Board, RelationType, Task, TaskRelations, User } from "@/types";
import { Calendar } from "lucide-react";
import { DetailAssigneeSelect } from "./detail-assignee-select";
import { DetailGroup } from "./detail-group";
import { DetailGroupTitle } from "./detail-group-title";
import { DetailPrioritySelect } from "./detail-priority-select";
import { DetailPropertyRow } from "./detail-property-row";
import { DetailStatusSelect } from "./detail-status-select";
import { LabelManager } from "./label-manager";
import { LabelPill } from "./label-pill";
import { DetailRelations } from "./detail-relations";

interface DetailPropertiesSidebarProps {
  task: Task;
  board: Board | undefined;
  users: User[];
  boardTasks: Task[];
  relations: TaskRelations | undefined;
  onUpdate: (data: Partial<Task>) => void;
  onAddRelation: (
    otherTaskId: string,
    type: RelationType,
    direction?: "source" | "target",
  ) => void;
  onRemoveRelation: (relationId: string) => void;
  onNavigate: (id: string) => void;
  onScrollTo: (anchor: string) => void;
  formatTimestamp: (ts: string) => string;
}

export function DetailPropertiesSidebar({
  task,
  board,
  users,
  boardTasks,
  relations,
  onUpdate,
  onAddRelation,
  onRemoveRelation,
  onNavigate,
  onScrollTo,
  formatTimestamp,
}: DetailPropertiesSidebarProps) {
  const taskLabels = task.taskLabels ?? task.labels ?? [];

  return (
    <aside className="w-[260px] max-w-[260px] shrink-0 border-l border-border bg-secondary">
      <ScrollArea className="h-full">
        <div className="w-[260px] max-w-[260px] p-4">
          {/* Group 1 — Properties */}
          <DetailGroup>
            <DetailGroupTitle>Properties</DetailGroupTitle>

            <DetailStatusSelect
              board={board}
              task={task}
              onChange={(id) => onUpdate({ statusId: id as any })}
            />

            <DetailPrioritySelect
              value={task.priority}
              onChange={(priority) => onUpdate({ priority })}
            />

            <DetailAssigneeSelect
              value={task.assigneeId ?? null}
              users={users}
              onChange={(assigneeId) => onUpdate({ assigneeId })}
            />
          </DetailGroup>

          {/* Group 2 — Labels */}
          <DetailGroup>
            <DetailGroupTitle>Labels</DetailGroupTitle>

            <div className="flex items-center gap-1.5 flex-wrap justify-start px-2 relative">
              {taskLabels.map((tl) => (
                <LabelPill key={tl.labelId} label={tl.label} />
              ))}
              <div className="absolute top-0 right-0">
                <LabelManager task={task} boardId={task.boardId} />
              </div>
            </div>
          </DetailGroup>

          {/* Group 3 — Blocked By */}
          <DetailGroup>
            <DetailGroupTitle>Blocked By</DetailGroupTitle>
            <DetailRelations
              relations={relations?.blockedBy}
              taskId={task.id}
              boardId={task.boardId}
              boardTasks={boardTasks}
              onAdd={onAddRelation}
              onRemove={onRemoveRelation}
              onNavigate={onNavigate}
              listType="blocks-target"
            />
          </DetailGroup>

          {/* Group 4 — Blocking */}
          <DetailGroup>
            <DetailGroupTitle>Blocking</DetailGroupTitle>
            <DetailRelations
              relations={relations?.blocking}
              taskId={task.id}
              boardId={task.boardId}
              boardTasks={boardTasks}
              onAdd={onAddRelation}
              onRemove={onRemoveRelation}
              onNavigate={onNavigate}
              listType="blocks-source"
            />
          </DetailGroup>

          {/* Group 5 — Relations */}
          <DetailGroup>
            <DetailGroupTitle>Related</DetailGroupTitle>
            <DetailRelations
              relations={relations?.relatedTo}
              taskId={task.id}
              boardId={task.boardId}
              boardTasks={boardTasks}
              onAdd={onAddRelation}
              onRemove={onRemoveRelation}
              onNavigate={onNavigate}
              listType="related_to"
            />
          </DetailGroup>
        </div>
      </ScrollArea>
    </aside>
  );
}
