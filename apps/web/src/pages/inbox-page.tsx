import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useNotifications, useMarkRead, useMarkAllRead } from '@/hooks/use-notifications'
import { InboxList } from '@/components/inbox-list'
import { InboxTaskDetail } from '@/components/inbox-task-detail'
import type { Notification } from '@/types'

export function InboxPage() {
  const { notificationId } = useParams<{ notificationId: string }>()
  const navigate = useNavigate()
  const { data: notifications = [] } = useNotifications('all')
  const markRead = useMarkRead()
  const markAllRead = useMarkAllRead()

  const selected = notifications.find((n) => n.id === notificationId) ?? null

  useEffect(() => {
    if (selected && selected.readAt === null) {
      markRead.mutate(selected.id)
    }
  }, [selected, markRead])

  return (
    <div className="flex flex-1 min-h-0">
      <InboxList
        notifications={notifications}
        selectedId={notificationId ?? null}
        onSelect={(n: Notification) => navigate(`/inbox/${n.id}`)}
        onMarkAllRead={() => markAllRead.mutate()}
      />
      {selected ? (
        <InboxTaskDetail
          notification={selected}
          onNavigateTask={() => {}}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
          <Bell className="size-6 mb-3 opacity-40" />
          <p className="text-sm">Select a notification</p>
        </div>
      )}
    </div>
  )
}