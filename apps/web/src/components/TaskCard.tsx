import { Task } from '@/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface TaskCardProps {
  task: Task
  isDragging?: boolean
}

export function TaskCard({ task, isDragging }: TaskCardProps) {
  const priorityColor = (p: string) => {
    switch (p) {
      case 'urgent': return 'text-red-500'
      case 'high': return 'text-orange-500'
      case 'medium': return 'text-indigo-500'
      default: return 'text-muted-foreground'
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 cursor-pointer transition-shadow",
        isDragging ? "shadow-lg ring-2 ring-primary" : "shadow-sm hover:shadow-md"
      )}
    >
      {/* Labels */}
      {task.labels && task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.labels.map((tl) => (
            <Badge
              key={tl.labelId}
              style={{ backgroundColor: tl.label.color }}
              className="text-white text-[10px] px-1.5 py-0"
            >
              {tl.label.name}
            </Badge>
          ))}
        </div>
      )}

      {/* Title */}
      <p className="text-sm font-medium leading-snug mb-2">{task.title}</p>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          {task.priority !== 'medium' && (
            <span className={cn("font-semibold", priorityColor(task.priority))}>
              {task.priority}
            </span>
          )}
          {task._count && task._count.comments > 0 && (
            <span>💬 {task._count.comments}</span>
          )}
        </div>
        {task.assignee && (
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-400 to-purple-600 flex items-center justify-center text-white text-[9px] font-bold">
              {task.assignee.charAt(0).toUpperCase()}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
