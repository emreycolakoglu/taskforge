/**
 * DetailRelations — three relation groups (Blocking / Blocked by / Related).
 *
 * Each group: heading + entries. Entries are compact border-defined rows with
 * mono task number + title + status pill + remove (×). "Add" uses a searchable
 * Popover (DetailAddRelationPopover) instead of the old Select — Select doesn't
 * scale and feels heavy for "add a relation".
 */

import { Ban, Link2, X } from 'lucide-react'
import { DetailAddRelationPopover } from './detail-add-relation-popover'
import type { RelationEntry, RelationType, Task } from '@/types'

interface RelationGroupProps {
  title: string
  icon: React.ReactNode
  entries: RelationEntry[]
  taskId: string
  boardTasks: Task[]
  emptyText: string
  onAdd: (otherTaskId: string) => void
  onRemove: (relationId: string) => void
  onNavigate: (taskId: string) => void
}

function RelationGroup({
  title,
  icon,
  entries,
  taskId,
  boardTasks,
  emptyText,
  onAdd,
  onRemove,
  onNavigate,
}: RelationGroupProps) {
  const existingIds = new Set(entries.map((e) => e.task.id))
  const excludeIds = new Set([taskId, ...existingIds])

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        {icon}
        {title}
        {entries.length > 0 && (
          <span className="text-muted-foreground/70">({entries.length})</span>
        )}
      </label>
      <div className="space-y-1.5">
        {entries.map((e) => (
          <div
            key={e.relationId}
            className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 cursor-pointer hover:bg-accent/30"
            onClick={() => onNavigate(e.task.id)}
          >
            <span className="text-xs text-muted-foreground font-mono shrink-0">
              {e.task.taskNumber}
            </span>
            <span className="text-sm text-foreground truncate flex-1">{e.task.title}</span>
            <button
              className="text-muted-foreground hover:text-foreground shrink-0"
              aria-label="Remove relation"
              onClick={(ev) => {
                ev.stopPropagation()
                onRemove(e.relationId)
              }}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {entries.length === 0 && (
          <p className="text-sm text-muted-foreground italic">{emptyText}</p>
        )}
        <DetailAddRelationPopover
          boardTasks={boardTasks}
          excludeIds={excludeIds}
          onAdd={onAdd}
        />
      </div>
    </div>
  )
}

interface DetailRelationsProps {
  relations: {
    blocking: RelationEntry[]
    blockedBy: RelationEntry[]
    relatedTo: RelationEntry[]
  }
  taskId: string
  boardId: string
  boardTasks: Task[]
  onAdd: (otherTaskId: string, type: RelationType, direction?: 'source' | 'target') => void
  onRemove: (relationId: string) => void
  onNavigate: (id: string) => void
}

export function DetailRelations({
  relations,
  taskId,
  boardId: _boardId,
  boardTasks,
  onAdd,
  onRemove,
  onNavigate,
}: DetailRelationsProps) {
  return (
    <section id="relations" className="space-y-4">
      <RelationGroup
        title="Blocking"
        icon={<Ban className="size-3.5" />}
        entries={relations.blocking}
        taskId={taskId}
        boardTasks={boardTasks}
        emptyText="Not blocking anything"
        onAdd={(otherTaskId) => onAdd(otherTaskId, 'blocks', 'source')}
        onRemove={onRemove}
        onNavigate={onNavigate}
      />
      <RelationGroup
        title="Blocked by"
        icon={<Ban className="size-3.5" />}
        entries={relations.blockedBy}
        taskId={taskId}
        boardTasks={boardTasks}
        emptyText="Not blocked"
        onAdd={(otherTaskId) => onAdd(otherTaskId, 'blocks', 'target')}
        onRemove={onRemove}
        onNavigate={onNavigate}
      />
      <RelationGroup
        title="Related"
        icon={<Link2 className="size-3.5" />}
        entries={relations.relatedTo}
        taskId={taskId}
        boardTasks={boardTasks}
        emptyText="No related tasks"
        onAdd={(otherTaskId) => onAdd(otherTaskId, 'related_to')}
        onRemove={onRemove}
        onNavigate={onNavigate}
      />
    </section>
  )
}