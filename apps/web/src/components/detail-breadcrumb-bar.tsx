/**
 * DetailBreadcrumbBar — sticky breadcrumb row above the task detail.
 *
 * Splits the old header into a breadcrumb row (identifier + nav actions) and
 * lets the title live in the main column below. Left: back chevron → breadcrumb
 * text (Board › List › TF-730). Right: prev/next + position indicator (mono) +
 * actions DropdownMenu (⋯) with Copy ID / Copy URL (client-side only).
 *
 * design.md: h-11, bg-secondary, border-b — matches board-header-bar pattern.
 * No title here. No Lime.
 */

import { ArrowLeft, ChevronLeft, ChevronRight, MoreHorizontal, Copy, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'

interface DetailBreadcrumbBarProps {
  boardName: string
  listName: string
  taskNumber: string
  taskId: string
  boardId: string
  position: { current: number; total: number }
  prevTask?: { id: string }
  nextTask?: { id: string }
  onBack: () => void
  onNavigateTask: (id: string) => void
}

export function DetailBreadcrumbBar({
  boardName,
  listName,
  taskNumber,
  taskId,
  position,
  prevTask,
  nextTask,
  onBack,
  onNavigateTask,
}: DetailBreadcrumbBarProps) {
  const copyId = () => {
    navigator.clipboard.writeText(taskNumber).then(
      () => toast.success('Task ID copied'),
      () => toast.error('Failed to copy'),
    )
  }

  const copyUrl = () => {
    navigator.clipboard.writeText(window.location.href).then(
      () => toast.success('Task URL copied'),
      () => toast.error('Failed to copy'),
    )
  }

  return (
    <header className="flex h-11 items-center justify-between px-6 border-b border-border bg-secondary shrink-0">
      {/* Left — back + breadcrumb */}
      <div className="flex items-center gap-2 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          aria-label="Back to board"
          onClick={onBack}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
          <span className="truncate">{boardName}</span>
          <span className="text-muted-foreground/50">›</span>
          <span className="truncate">{listName}</span>
          <span className="text-muted-foreground/50">›</span>
          <span className="font-mono text-foreground shrink-0">{taskNumber}</span>
        </nav>
      </div>

      {/* Right — prev/next + position + actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          disabled={!prevTask}
          aria-label="Previous task"
          onClick={() => prevTask && onNavigateTask(prevTask.id)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {position.current}/{position.total}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          disabled={!nextTask}
          aria-label="Next task"
          onClick={() => nextTask && onNavigateTask(nextTask.id)}
        >
          <ChevronRight className="size-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              aria-label="Task actions"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={copyId}>
              <Copy className="size-4" />
              Copy ID
            </DropdownMenuItem>
            <DropdownMenuItem onClick={copyUrl}>
              <Link2 className="size-4" />
              Copy URL
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}