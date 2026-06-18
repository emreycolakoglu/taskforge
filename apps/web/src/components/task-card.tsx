import { Task } from '@/types'
import { cn } from '@/lib/utils'
import { LabelPill } from './label-pill'
import { LabelManager } from './label-manager'

interface TaskCardProps {
  task: Task
  isDragging?: boolean
  boardId?: string
}

export function TaskCard({ task, isDragging, boardId }: TaskCardProps) {
  const priorityColor = (p: string) => {
    switch (p) {
      case 'urgent': return 'text-destructive'
      case 'high': return 'text-orange-600 dark:text-orange-400'
      case 'medium': return 'text-indigo-600 dark:text-indigo-400'
      default: return 'text-muted-foreground'
    }
  }

  const labels = task.taskLabels ?? task.labels ?? []

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 cursor-pointer transition-shadow motion-reduce:transition-none",
        isDragging ? "shadow-lg ring-2 ring-primary" : "shadow-sm hover:shadow-md"
      )}
    >
      {/* Labels */}
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {labels.map((tl) => (
            <LabelPill key={tl.labelId} label={tl.label} />
          ))}
        </div>
      )}

      {/* Title */}
      <p className="text-sm font-medium leading-snug mb-2">
        {task.taskNumber && (
          <span className="text-muted-foreground font-normal mr-1">{task.taskNumber}</span>
        )}
        {task.title}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          {task.priority !== 'medium' && (
            <span className={cn("font-semibold", priorityColor(task.priority))}>
              {task.priority}
            </span>
          )}
          {task._count && task._count.comments > 0 && (
            <span aria-label={`${task._count.comments} comments`}>💬 {task._count.comments}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {task.assignee && (
            <div className="flex items-center gap-1.5">
              <div
                className="size-5 rounded-full bg-gradient-to-br from-indigo-400 to-purple-600 flex items-center justify-center text-white text-[9px] font-bold"
                aria-hidden="true"
              >
                {task.assignee.displayName.charAt(0).toUpperCase()}
              </div>
              <span className="text-[11px] text-muted-foreground">{task.assignee.displayName}</span>
            </div>
          )}
          {boardId && <LabelManager task={task} boardId={boardId} />}
        </div>
      </div>
    </div>
  )
}