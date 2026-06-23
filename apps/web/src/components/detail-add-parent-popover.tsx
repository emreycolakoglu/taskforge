/**
 * DetailAddParentPopover — searchable task picker for setting a parent task.
 *
 * Filters out self, tasks that already have a parent, and tasks that are
 * sub-tasks of this task (prevent cycles — matches the original logic).
 */

import { useState, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Task } from '@/types'

interface DetailAddParentPopoverProps {
  boardTasks: Task[]
  currentTaskId: string
  currentSubTaskIds: Set<string>
  onAdd: (id: string) => void
}

export function DetailAddParentPopover({
  boardTasks,
  currentTaskId,
  currentSubTaskIds,
  onAdd,
}: DetailAddParentPopoverProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return boardTasks
      .filter(
        (t) =>
          t.id !== currentTaskId
          && !t.parentId
          && !currentSubTaskIds.has(t.id),
      )
      .filter((t) =>
        q === ''
          ? true
          : t.title.toLowerCase().includes(q) ||
            (t.taskNumber ?? '').toLowerCase().includes(q),
      )
      .slice(0, 50)
  }, [boardTasks, currentTaskId, currentSubTaskIds, query])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
          <Plus className="size-3.5" />
          Set parent
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tasks…"
          className="border-0 rounded-none border-b border-border focus-visible:ring-0 focus-visible:border-border"
        />
        <div className="max-h-48 overflow-y-auto p-1">
          {filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded-sm cursor-pointer w-full text-left"
              onClick={() => {
                onAdd(t.id)
                setOpen(false)
                setQuery('')
              }}
            >
              <span className="text-xs font-mono text-muted-foreground shrink-0">
                {t.taskNumber}
              </span>
              <span className="text-foreground truncate">{t.title}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-1.5">No tasks found</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}