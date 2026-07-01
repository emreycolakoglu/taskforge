import { Bell, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { Notification } from '@/types'

interface InboxListProps {
  notifications: Notification[]
  selectedId: string | null
  onSelect: (n: Notification) => void
  onMarkAllRead: () => void
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function InboxList({ notifications, selectedId, onSelect, onMarkAllRead }: InboxListProps) {
  return (
    <aside className="w-[360px] shrink-0 border-r border-border bg-secondary flex flex-col">
      <div className="flex items-center justify-between h-11 px-4 border-b border-border">
        <span className="text-sm font-medium text-foreground">Inbox</span>
        {notifications.some((n) => n.readAt === null) && (
          <Button variant="ghost" size="sm" onClick={onMarkAllRead} className="h-7 px-2 text-xs text-muted-foreground">
            <CheckCheck className="size-3.5 mr-1" />
            Mark all read
          </Button>
        )}
      </div>
      <ScrollArea className="flex-1">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground text-sm">
            <Bell className="size-5 mb-2 opacity-50" />
            No notifications
          </div>
        ) : (
          <ul className="flex flex-col">
            {notifications.map((n) => {
              const isSelected = n.id === selectedId
              const isUnread = n.readAt === null
              const taskNumber = n.task?.board?.identifier
                ? `${n.task.board.identifier}-${n.task.number}`
                : null
              return (
                <li key={n.id}>
                  <button
                    onClick={() => onSelect(n)}
                    className={cn(
                      'relative w-full text-left px-4 py-3 flex flex-col gap-1 border-b border-border transition-colors',
                      isSelected ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent/50',
                    )}
                  >
                    {isSelected && (
                      <span className="absolute left-0 top-0 h-full w-0.5 bg-primary" />
                    )}
                    <div className="flex items-center gap-2">
                      <span className="size-5 shrink-0 rounded-full border border-border bg-secondary-foreground/10 flex items-center justify-center text-[11px] font-semibold text-muted-foreground">
                        {n.summary.charAt(0).toUpperCase()}
                      </span>
                      <span className="flex-1 text-[13px] leading-snug font-medium text-foreground line-clamp-2">
                        {n.summary}
                      </span>
                      {isUnread && (
                        <span className="size-1.5 shrink-0 rounded-full bg-chart-5" aria-label="unread" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 pl-7">
                      {taskNumber && (
                        <span className="font-mono text-[11px] text-muted-foreground">{taskNumber}</span>
                      )}
                      <span className="font-mono text-[11px] text-muted-foreground">{relativeTime(n.createdAt)}</span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </ScrollArea>
    </aside>
  )
}