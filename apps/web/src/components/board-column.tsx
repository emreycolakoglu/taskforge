/**
 * BoardColumn — single Kanban column (Linear-style).
 *
 * Fixed 348px width, 50px header with status dot + name + count + column menu.
 * The card-list body is the DnD Droppable target — the Droppable wrapper lives in
 * kanban-board.tsx, which passes `droppableProvided` + `isDraggingOver` here so
 * this component stays presentational. The `+` footer holds the inline quick-add.
 */

import type { ReactNode } from 'react'
import { MoreHorizontal, Plus } from 'lucide-react'
import type { Status } from '@/types'
import { Button } from '@/components/ui/button'
import { ProgressIcon } from '@/components/progress-icon'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface BoardColumnProps {
  status: Status
  taskCount: number
  isAdding: boolean
  onAddTask: () => void
  onDeleteStatus: () => void
  onEditStatus: () => void
  /** Droppable ref + props from the parent Droppable (DnD lives in kanban-board.tsx). */
  droppableProvided?: {
    innerRef: (el: HTMLElement | null) => void
    droppableProps: Record<string, unknown>
    placeholder: ReactNode
  }
  isDraggingOver?: boolean
  children: ReactNode
}

export function BoardColumn({
  status,
  taskCount,
  isAdding,
  onAddTask,
  onDeleteStatus,
  onEditStatus,
  droppableProvided,
  isDraggingOver,
  children,
}: BoardColumnProps) {
  return (
    <div
      className={cn(
        'flex flex-col w-[348px] shrink-0 h-full rounded-lg border border-border bg-card/40',
        isDraggingOver && 'bg-accent/30',
      )}
    >
      {/* Column header — 50px, progress icon + status dot + name + count + menu */}
      <div className="h-[50px] shrink-0 px-3 flex items-center gap-2 border-b border-border">
        <ProgressIcon progress={status.progress ?? 0} size={16} />
        <span
          className="size-3.5 rounded-full shrink-0"
          style={{ backgroundColor: status.color || '#62666d' }}
        />
        <span className="text-sm font-medium text-foreground">{status.name}</span>
        <span className="text-xs font-mono text-muted-foreground">{taskCount}</span>
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground hover:text-foreground"
                aria-label={`Open ${status.name} menu`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onAddTask}>
                <Plus className="size-4 mr-2" />
                Add task
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEditStatus}>
                Edit status
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDeleteStatus}>
                Delete status
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Card list — the Droppable target */}
      <div
        ref={droppableProvided?.innerRef}
        {...(droppableProvided?.droppableProps ?? {})}
        className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-[80px]"
      >
        {taskCount === 0 && !isAdding && (
          <div className="text-center text-xs text-muted-foreground py-6">No issues</div>
        )}
        {children}
        {droppableProvided?.placeholder}
      </div>

      {/* + footer — inline quick-add */}
      <div className="p-2 border-t border-border">
        {isAdding ? null : (
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={onAddTask}
            className="w-full justify-start gap-2 px-2 text-xs text-muted-foreground [&_svg]:size-3.5"
          >
            <Plus />
            New issue
          </Button>
        )}
      </div>
    </div>
  )
}