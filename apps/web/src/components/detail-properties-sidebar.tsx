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

import { ListChecks, Clock, Calendar } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { LabelPill } from './label-pill'
import { LabelManager } from './label-manager'
import { DetailPropertyRow } from './detail-property-row'
import { DetailPrioritySelect } from './detail-priority-select'
import { DetailAssigneeSelect } from './detail-assignee-select'
import { DetailAddParentPopover } from './detail-add-parent-popover'
import { DetailRelations } from './detail-relations'
import { SubscribeButton } from './subscribe-button'
import type { Board, Task, User, TaskRelations, RelationType } from '@/types'

interface DetailPropertiesSidebarProps {
  task: Task
  board: Board | undefined
  users: User[]
  boardTasks: Task[]
  relations: TaskRelations | undefined
  onUpdate: (data: Partial<Task>) => void
  onAddRelation: (otherTaskId: string, type: RelationType, direction?: 'source' | 'target') => void
  onRemoveRelation: (relationId: string) => void
  onNavigate: (id: string) => void
  onScrollTo: (anchor: string) => void
  formatTimestamp: (ts: string) => string
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
  const taskLabels = task.taskLabels ?? task.labels ?? []
  const statusName = board?.statuses?.find((s) => s.id === task.statusId)?.name ?? 'Unknown status'
  const subTaskIds = new Set((task.subTasks ?? []).map((st) => st.id))

  const parentNumber = task.parent?.board?.identifier
    ? `${task.parent.board.identifier}-${task.parent.number}`
    : task.parent
      ? `#${task.parent.number}`
      : null

  return (
    <aside className="w-[260px] shrink-0 border-l border-border bg-secondary">
      <ScrollArea className="h-full">
        <div className="p-4 space-y-1">
          <DetailPropertyRow label="Subscribed">
            <SubscribeButton taskId={task.id} />
          </DetailPropertyRow>
          {/* Group 1 — Status & ownership */}
          <DetailPropertyRow label="Priority">
            <DetailPrioritySelect
              value={task.priority}
              onChange={(priority) => onUpdate({ priority })}
            />
          </DetailPropertyRow>
          <DetailPropertyRow label="Assignee">
            <DetailAssigneeSelect
              value={task.assigneeId ?? null}
              users={users}
              onChange={(assigneeId) => onUpdate({ assigneeId })}
            />
          </DetailPropertyRow>
          <DetailPropertyRow label="Labels">
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {taskLabels.map((tl) => (
                <LabelPill key={tl.labelId} label={tl.label} />
              ))}
              <LabelManager task={task} boardId={task.boardId} />
            </div>
          </DetailPropertyRow>

          <Separator />

          {/* Group 2 — Organization */}
          <DetailPropertyRow label="Status">
            <span className="flex items-center gap-1.5 text-sm text-foreground">
              <ListChecks className="size-3.5 text-muted-foreground" />
              {statusName}
            </span>
          </DetailPropertyRow>
          <DetailPropertyRow label="Parent">
            {task.parent && parentNumber ? (
              <button
                className="flex items-center gap-1.5 text-sm text-foreground hover:text-ring hover:underline"
                onClick={() => onNavigate(task.parent!.id)}
              >
                <span className="font-mono text-xs text-muted-foreground">{parentNumber}</span>
                <span className="truncate max-w-[120px]">{task.parent.title}</span>
              </button>
            ) : (
              <DetailAddParentPopover
                boardTasks={boardTasks}
                currentTaskId={task.id}
                currentSubTaskIds={subTaskIds}
                onAdd={(id) => onUpdate({ parentId: id })}
              />
            )}
          </DetailPropertyRow>
          <DetailPropertyRow
            label="Sub-issues"
            onClick={() => onScrollTo('sub-issues')}
          >
            <span className="text-sm text-muted-foreground">
              {(task.subTasks ?? []).length} sub-issues
            </span>
          </DetailPropertyRow>

          <Separator />

          {/* Group 3 — Relations */}
          <DetailRelations
            relations={relations ?? { blocking: [], blockedBy: [], relatedTo: [] }}
            taskId={task.id}
            boardId={task.boardId}
            boardTasks={boardTasks}
            onAdd={onAddRelation}
            onRemove={onRemoveRelation}
            onNavigate={onNavigate}
          />

          <Separator />

          {/* Group 4 — Dates */}
          <DetailPropertyRow label="Created">
            <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
              <Clock className="size-3" />
              {formatTimestamp(task.createdAt)}
            </span>
          </DetailPropertyRow>
          <DetailPropertyRow label="Updated">
            <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
              <Clock className="size-3" />
              {formatTimestamp(task.updatedAt)}
            </span>
          </DetailPropertyRow>
          {task.dueDate && (
            <DetailPropertyRow label="Due date">
              <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                <Calendar className="size-3" />
                {new Date(task.dueDate).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </DetailPropertyRow>
          )}
        </div>
      </ScrollArea>
    </aside>
  )
}