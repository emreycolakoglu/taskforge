import { Link } from 'react-router-dom'
import { ExternalLink, Loader2 } from 'lucide-react'
import { useTask } from '@/hooks/use-tasks'
import { TaskDetailView } from '@/components/task-detail-view'
import type { Notification } from '@/types'

interface InboxTaskDetailProps {
  notification: Notification
  onNavigateTask: (id: string) => void
}

export function InboxTaskDetail({ notification, onNavigateTask }: InboxTaskDetailProps) {
  const { data: task, isLoading } = useTask(notification.taskId)

  if (isLoading || !task) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="flex items-center justify-between h-11 px-6 border-b border-border bg-background">
        <span className="text-sm text-muted-foreground">Notification detail</span>
        <Link
          to={`/board/${task.boardId}/task/${task.id}`}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="size-3.5" />
          Open in full page
        </Link>
      </div>
      <TaskDetailView
        taskId={notification.taskId}
        boardId={task.boardId}
        onNavigateTask={onNavigateTask}
      />
    </div>
  )
}