import { Bell, BellOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSubscription, useSubscribe, useUnsubscribe } from '@/hooks/use-subscriptions'

interface SubscribeButtonProps {
  taskId: string
}

export function SubscribeButton({ taskId }: SubscribeButtonProps) {
  const { data } = useSubscription(taskId)
  const subscribe = useSubscribe()
  const unsubscribe = useUnsubscribe()

  const subscribed = data?.subscribed ?? false

  return (
    <Button
      variant={subscribed ? 'outline' : 'ghost'}
      size="sm"
      className="h-7 w-full justify-start text-xs"
      onClick={() => (subscribed ? unsubscribe.mutate(taskId) : subscribe.mutate(taskId))}
      disabled={!data}
    >
      {subscribed ? (
        <>
          <Bell className="size-3.5 mr-2" />
          Subscribed
        </>
      ) : (
        <>
          <BellOff className="size-3.5 mr-2" />
          Subscribe
        </>
      )}
    </Button>
  )
}