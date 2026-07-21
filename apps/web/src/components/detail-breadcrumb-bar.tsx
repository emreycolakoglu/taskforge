/**
 * DetailBreadcrumbBar — sticky breadcrumb row above the task detail.
 *
 * Splits the old header into a breadcrumb row (identifier + nav actions) and
 * lets the title live in the main column below. Left: back chevron → breadcrumb
 * text (Board › Status › TF-730) + a Public badge when the task is shared.
 * Right: prev/next + position indicator (mono) + actions DropdownMenu (⋯) with
 * Copy ID / Copy URL (client-side only) and the public-sharing toggle.
 *
 * The Public badge is not decoration: publishing is one click in an overflow
 * menu, so the badge is the only thing that makes "which tasks are currently
 * public?" answerable by looking at the page.
 *
 * design.md: h-11, bg-secondary, border-b — matches board-header-bar pattern.
 * No title here. No Lime — including on the badge, which is Indigo (accent),
 * since Lime is reserved for a single primary CTA per screen.
 */

import { ArrowLeft, ChevronLeft, ChevronRight, MoreHorizontal, Copy, Link2, Globe, GlobeLock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { toast } from 'sonner'

/** The public URL for a task, derived from its number (e.g. TF-123 → /public/TF/123). */
function publicUrlFor(taskNumber: string): string | null {
  const match = taskNumber.match(/^(.+)-(\d+)$/)
  if (!match) return null
  const [, identifier, number] = match
  return `${window.location.origin}/public/${identifier}/${number}`
}

interface DetailBreadcrumbBarProps {
  boardName: string
  statusName: string
  taskNumber: string
  taskId: string
  boardId: string
  isPublic: boolean
  position: { current: number; total: number }
  prevTask?: { id: string }
  nextTask?: { id: string }
  onBack: () => void
  onNavigateTask: (id: string) => void
  onSetPublic: (isPublic: boolean) => Promise<void>
  /** Optional slot rendered in the right action group (e.g. mobile Properties button). */
  propertiesTrigger?: React.ReactNode
}

export function DetailBreadcrumbBar({
  boardName,
  statusName,
  taskNumber,
  isPublic,
  position,
  prevTask,
  nextTask,
  onBack,
  onNavigateTask,
  onSetPublic,
  propertiesTrigger,
}: DetailBreadcrumbBarProps) {
  const publicUrl = publicUrlFor(taskNumber)

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

  // Publish and copy in one gesture — the point of the button is to walk away
  // with a link. If the clipboard write fails the task is still published, so
  // the toast falls back to showing the URL rather than claiming a copy.
  const makePublic = async () => {
    await onSetPublic(true)
    if (!publicUrl) return
    navigator.clipboard.writeText(publicUrl).then(
      () => toast.success('Task published', { description: 'Public link copied to clipboard' }),
      () => toast.success('Task published', { description: publicUrl }),
    )
  }

  const makePrivate = async () => {
    await onSetPublic(false)
    toast.success('Task is no longer public', {
      description: 'The public link now shows a not-found page.',
    })
  }

  const copyPublicUrl = () => {
    if (!publicUrl) return
    navigator.clipboard.writeText(publicUrl).then(
      () => toast.success('Public link copied'),
      () => toast.error('Failed to copy'),
    )
  }

  return (
    <header className="flex h-11 items-center justify-between px-6 border-b border-border bg-secondary shrink-0">
      {/* Left — back + breadcrumb */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Mobile-only: toggles the off-canvas sidebar. Hidden ≥md where the
            sidebar is always docked. */}
        <SidebarTrigger
          className="md:hidden text-muted-foreground hover:text-foreground"
          aria-label="Toggle sidebar"
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          aria-label="Back to board"
          onClick={onBack}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="text-xs">
            <BreadcrumbItem className="truncate">{boardName}</BreadcrumbItem>
            <BreadcrumbSeparator>›</BreadcrumbSeparator>
            <BreadcrumbItem className="truncate">{statusName}</BreadcrumbItem>
            <BreadcrumbSeparator>›</BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage className="font-mono">{taskNumber}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        {isPublic && (
          <Badge
            variant="outline"
            className="shrink-0 gap-1 border-indigo/40 text-indigo"
            title="Anyone with the link can view this task"
          >
            <Globe className="size-3" />
            Public
          </Badge>
        )}
      </div>

      {/* Right — prev/next + position + actions */}
      <div className="flex items-center gap-1 shrink-0">
        {propertiesTrigger}
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
            <DropdownMenuSeparator />
            {isPublic ? (
              <>
                <DropdownMenuItem onClick={copyPublicUrl}>
                  <Globe className="size-4" />
                  Copy public link
                </DropdownMenuItem>
                <DropdownMenuItem onClick={makePrivate}>
                  <GlobeLock className="size-4" />
                  Make private
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem onClick={makePublic}>
                <Globe className="size-4" />
                Make public
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}