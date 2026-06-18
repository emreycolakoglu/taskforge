import { useState, useCallback } from 'react'
import { Tag } from 'lucide-react'
import { api } from '@/hooks/api'
import { useLabels } from '@/hooks/use-labels'
import { useQueryClient } from '@tanstack/react-query'
import type { Task, TaskLabel } from '@/types'
import { LabelPill } from './label-pill'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface LabelManagerProps {
  task: Task
  boardId: string
}

export function LabelManager({ task, boardId }: LabelManagerProps) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const queryClient = useQueryClient()
  const { data: allLabels = [] } = useLabels(boardId)

  const currentLabelIds = new Set((task.taskLabels ?? task.labels ?? []).map((tl: TaskLabel) => tl.labelId))

  const toggle = useCallback(async (labelId: string) => {
    const isAttached = currentLabelIds.has(labelId)
    // Optimistic update
    setPending((prev) => new Set(prev).add(labelId))

    const queryKey = ['boards', boardId, 'full']
    // Snapshot current data for rollback
    const previous = queryClient.getQueryData(queryKey)

    // Optimistically update the board data
    queryClient.setQueryData(queryKey, (old: unknown) => {
      if (!old || typeof old !== 'object' || old === null) return old
      const board = old as Record<string, unknown>
      const lists = board.lists as Array<Record<string, unknown>> | undefined
      if (!lists) return old

      return {
        ...board,
        lists: lists.map((list) => ({
          ...list,
          tasks: (list.tasks as Array<Record<string, unknown>>).map((t) => {
            if (t.id !== task.id) return t
            const existingLabels = (t.taskLabels ?? t.labels ?? []) as TaskLabel[]
            if (isAttached) {
              return {
                ...t,
                taskLabels: existingLabels.filter((tl: TaskLabel) => tl.labelId !== labelId),
                labels: existingLabels.filter((tl: TaskLabel) => tl.labelId !== labelId),
              }
            } else {
              const label = allLabels.find((l) => l.id === labelId)
              if (!label) return t
              const newTL: TaskLabel = {
                taskId: task.id,
                labelId,
                assignedAt: new Date().toISOString(),
                label,
              }
              return {
                ...t,
                taskLabels: [...existingLabels, newTL],
                labels: [...existingLabels, newTL],
              }
            }
          }),
        })),
      }
    })

    try {
      if (isAttached) {
        await api.labels.detach(task.id, labelId)
      } else {
        await api.labels.attach(task.id, labelId)
      }
    } catch {
      // Rollback on error
      queryClient.setQueryData(queryKey, previous)
    } finally {
      setPending((prev) => {
        const next = new Set(prev)
        next.delete(labelId)
        return next
      })
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey })
    }
  }, [task.id, task.taskLabels, task.labels, boardId, allLabels, currentLabelIds, queryClient])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-5 shrink-0"
          aria-label="Manage labels"
          onClick={(e) => e.stopPropagation()}
        >
          <Tag className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-2">
        <div className="text-xs font-medium text-muted-foreground mb-1.5">Labels</div>
        <div className="flex flex-col gap-1">
          {allLabels.map((label) => {
            const isAttached = currentLabelIds.has(label.id)
            const isPending = pending.has(label.id)
            return (
              <button
                key={label.id}
                type="button"
                disabled={isPending}
                onClick={() => toggle(label.id)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors text-left',
                  isAttached && 'bg-accent/50',
                )}
              >
                <span
                  className="size-3 rounded-full shrink-0"
                  style={{ backgroundColor: label.color }}
                />
                <span className="truncate">{label.name}</span>
                {isAttached && (
                  <span className="ml-auto text-xs text-muted-foreground">✓</span>
                )}
              </button>
            )
          })}
          {allLabels.length === 0 && (
            <p className="text-xs text-muted-foreground py-1">No labels on this board</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}