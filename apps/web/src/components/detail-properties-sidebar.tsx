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

import { ScrollArea } from '@/components/ui/scroll-area';
import type { Board, RelationType, Task, TaskRelations } from '@/types';
import type { AssigneeOption } from './detail-assignee-select';
import { Calendar, X } from 'lucide-react';
import { DetailAssigneeSelect } from './detail-assignee-select';
import { DetailGroup } from './detail-group';
import { DetailGroupTitle } from './detail-group-title';
import { DetailPrioritySelect } from './detail-priority-select';
import { DetailEstimateInput } from './detail-estimate-input';
import { DetailPropertyRow } from './detail-property-row';
import { DetailStatusSelect } from './detail-status-select';
import { DetailAddParentPopover } from './detail-add-parent-popover';
import { LabelManager } from './label-manager';
import { LabelPill } from './label-pill';
import { DetailRelations } from './detail-relations';

interface DetailPropertiesSidebarProps {
  task: Task;
  board: Board | undefined;
  users: AssigneeOption[];
  boardTasks: Task[];
  relations: TaskRelations | undefined;
  onUpdate: (data: Partial<Task>) => void;
  onAddRelation: (otherTaskId: string, type: RelationType, direction?: 'source' | 'target') => void;
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

  // TFG-57: full-width inside the mobile Sheet, fixed 260px docked on ≥md.
  return (
    <aside className="w-full max-w-full md:w-[260px] md:max-w-[260px] md:shrink-0 border-l border-border bg-secondary">
      <ScrollArea className="h-full">
        <div className="w-full max-w-full md:w-[260px] md:max-w-[260px] p-4">
          {relations?.duplicateOf && relations.duplicateOf.length > 0 && (
            <div className="rounded-lg border border-border bg-background px-3 py-2 mb-3 text-sm text-muted-foreground">
              This is a duplicate of{' '}
              {relations.duplicateOf.map((r, i) => (
                <span key={r.relationId}>
                  {i > 0 && ', '}
                  <button
                    className="font-mono text-foreground underline underline-offset-2 hover:text-muted-foreground"
                    onClick={() => onNavigate(r.task.id)}
                  >
                    {r.task.taskNumber}
                  </button>
                </span>
              ))}
            </div>
          )}
          {/* Group 1 — Properties */}
          <DetailGroup>
            <DetailGroupTitle>Properties</DetailGroupTitle>

            {/* TFG-58 — set / change / clear the parent task. */}
            <DetailPropertyRow label="Parent">
              {task.parent ? (
                <>
                  <button
                    className="font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
                    onClick={() => onNavigate(task.parent!.id)}
                  >
                    {task.parent.board?.identifier
                      ? `${task.parent.board.identifier}-${task.parent.number}`
                      : `#${task.parent.number}`}
                  </button>
                  <button
                    aria-label="Unlink parent"
                    title="Unlink parent"
                    className="text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
                    onClick={() => onUpdate({ parentId: null })}
                  >
                    <X />
                  </button>
                </>
              ) : (
                <DetailAddParentPopover
                  boardTasks={boardTasks}
                  currentTaskId={task.id}
                  currentSubTaskIds={new Set((task.subTasks ?? []).map((st) => st.id))}
                  onAdd={(id) => onUpdate({ parentId: id })}
                />
              )}
            </DetailPropertyRow>

            <DetailStatusSelect
              board={board}
              task={task}
              onChange={(id) => onUpdate({ statusId: id as any })}
            />

            <DetailPrioritySelect
              value={task.priority}
              onChange={(priority) => onUpdate({ priority })}
            />

            <DetailEstimateInput
              value={task.estimate ?? null}
              onChange={(estimate) => onUpdate({ estimate })}
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

          {/* Group 6 — Duplicate of */}
          <DetailGroup>
            <DetailGroupTitle>Duplicate of</DetailGroupTitle>
            <DetailRelations
              relations={relations?.duplicateOf}
              taskId={task.id}
              boardId={task.boardId}
              boardTasks={boardTasks}
              onAdd={onAddRelation}
              onRemove={onRemoveRelation}
              onNavigate={onNavigate}
              listType="duplicate-source"
            />
          </DetailGroup>

          {/* Group 7 — Duplicates */}
          <DetailGroup>
            <DetailGroupTitle>Duplicates</DetailGroupTitle>
            <DetailRelations
              relations={relations?.duplicates}
              taskId={task.id}
              boardId={task.boardId}
              boardTasks={boardTasks}
              onAdd={onAddRelation}
              onRemove={onRemoveRelation}
              onNavigate={onNavigate}
              listType="duplicate-target"
            />
          </DetailGroup>
        </div>
      </ScrollArea>
    </aside>
  );
}
