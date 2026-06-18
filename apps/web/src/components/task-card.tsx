/**
 * TaskCard — Linear-inspired task card.
 *
 * Structure:
 *   ┌───────────────────────────────┐
 *   │  TF-730              [tag btn] │  ← taskNumber (muted) + hover-revealed label manager
 *   │  Task title here              │  ← title (semibold)
 *   │                               │
 *   │  🔴 🟢  💬3  👤              │  ← compact icon footer (priority → label pills → comments → assignee)
 *   └───────────────────────────────┘
 *
 * Footer items: priority icon → label pills (+N overflow) → comment count → assignee avatar
 */

import { Task } from '@/types'
import { cn } from '@/lib/utils'
import { LabelManager } from './label-manager'

// ── Contrast helper ───────────────────────────────────────────────────────────

function contrastTextColor(hex: string): string {
  const hex6 = hex.replace('#', '')
  const r = parseInt(hex6.substring(0, 2), 16)
  const g = parseInt(hex6.substring(2, 4), 16)
  const b = parseInt(hex6.substring(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.55 ? '#111111' : '#ffffff'
}

// ── Priority icons (14×14 inline SVGs) ──────────────────────────────────────

function PriorityUrgentIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 4v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="7" cy="9.5" r="0.75" fill="currentColor" />
    </svg>
  )
}

function PriorityHighIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 10l3-6 3 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 7l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PriorityMediumIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="7" cy="7" r="3" fill="currentColor" />
    </svg>
  )
}

function PriorityLowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 4l3 6 3-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CommentIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 3a1 1 0 011-1h8a1 1 0 011 1v5a1 1 0 01-1 1H5l-2 2V9H3a1 1 0 01-1-1V3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

interface TaskCardProps {
  task: Task
  isDragging?: boolean
  boardId?: string
}

export function TaskCard({ task, isDragging, boardId }: TaskCardProps) {
  const labels = task.taskLabels ?? task.labels ?? []

  const priorityIcon = () => {
    switch (task.priority) {
      case 'urgent':
        return <span title="Urgent" className="text-destructive"><PriorityUrgentIcon /></span>
      case 'high':
        return <span title="High" className="text-orange-600 dark:text-orange-400"><PriorityHighIcon /></span>
      case 'medium':
        return <span title="Medium" className="text-indigo-600 dark:text-indigo-400"><PriorityMediumIcon /></span>
      case 'low':
        return <span title="Low" className="text-muted-foreground"><PriorityLowIcon /></span>
    }
  }

  const visibleLabels = labels.slice(0, 2)
  const overflowCount = labels.length > 2 ? labels.length - 2 : 0

  return (
    <div
      className={cn(
        "group/card rounded-lg border bg-card p-3 cursor-pointer transition-shadow motion-reduce:transition-none",
        isDragging ? "shadow-lg ring-2 ring-primary" : "shadow-sm hover:shadow-md"
      )}
    >
      {/* Header: task number + label manager (hover) */}
      <div className="flex items-start justify-between gap-2 mb-0.5">
        {task.taskNumber && (
          <span className="text-[11px] text-muted-foreground font-normal leading-none">
            {task.taskNumber}
          </span>
        )}
        {boardId && (
          <div className="opacity-0 group-hover/card:opacity-100 transition-opacity">
            <LabelManager task={task} boardId={boardId} />
          </div>
        )}
      </div>

      {/* Title */}
      <p className="text-sm font-semibold leading-snug mb-2">
        {task.title}
      </p>

      {/* Compact icon footer */}
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {priorityIcon()}

        {visibleLabels.length > 0 && (
          <div className="flex items-center gap-1">
            {visibleLabels.map((tl) => (
              <span
                key={tl.labelId}
                className="inline-flex items-center rounded-full px-1.5 text-[10px] font-medium leading-4 whitespace-nowrap"
                style={{
                  backgroundColor: tl.label.color,
                  color: contrastTextColor(tl.label.color),
                }}
              >
                {tl.label.name}
              </span>
            ))}
            {overflowCount > 0 && (
              <span className="text-[10px] text-muted-foreground">+{overflowCount}</span>
            )}
          </div>
        )}

        {task._count && task._count.comments > 0 && (
          <span
            className="flex items-center gap-0.5 text-[11px]"
            aria-label={`${task._count.comments} comments`}
          >
            <CommentIcon />
            {task._count.comments}
          </span>
        )}

        {task.assignee && (
          <div
            className="size-5 rounded-full bg-gradient-to-br from-indigo-400 to-purple-600 flex items-center justify-center text-white text-[9px] font-bold shrink-0 ml-auto"
            title={task.assignee.displayName}
          >
            {task.assignee.displayName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
    </div>
  )
}