/**
 * BoardHeaderBar — sticky board header (Linear-style command deck bar).
 *
 * Three groups: breadcrumb/title (left), view tabs (center), toolbar + CTA (right).
 * The "New Issue" button is the screen's single rationed Acid Lime CTA per design.md.
 * No lime appears anywhere else in the header.
 */

import { List, Columns3, Plus, Settings } from 'lucide-react'
import type { Board } from '@/types'
import type { ViewMode } from '@/hooks/use-board-view-state'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { SidebarTrigger } from '@/components/ui/sidebar'

interface BoardHeaderBarProps {
  board: Board
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  onOpenSettings: () => void
  onNewTask: () => void
}

export function BoardHeaderBar({
  board,
  viewMode,
  onViewModeChange,
  onOpenSettings,
  onNewTask,
}: BoardHeaderBarProps) {
  return (
    <header className="flex h-12 items-center justify-between px-6 border-b border-border bg-secondary shrink-0">
      {/* Left — breadcrumb / title */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Mobile-only: toggles the off-canvas sidebar. Hidden ≥md where the
            sidebar is always docked. */}
        <SidebarTrigger
          className="md:hidden text-muted-foreground hover:text-foreground"
          aria-label="Toggle sidebar"
        />
        <h1 className="text-sm font-medium text-foreground truncate">
          <span className="mr-1.5">{board.icon ?? "⭐"}</span>
          {board.name}
        </h1>
      </div>

      {/* Center — view tabs. Active state = Graphite (bg-accent), NOT Lime
          (design.md conflict register #1: Lime reserved for the New Issue CTA). */}
      <ToggleGroup
        type="single"
        value={viewMode}
        onValueChange={(v) => { if (v) onViewModeChange(v as ViewMode) }}
        aria-label="View mode"
        variant="outline"
        size="sm"
        className="shrink-0"
      >
        <ToggleGroupItem
          value="list"
          aria-label="List view"
          className="data-[state=on]:bg-accent data-[state=on]:text-foreground data-[state=on]:border-border"
        >
          <List className="size-3.5" />
          List
        </ToggleGroupItem>
        <ToggleGroupItem
          value="kanban"
          aria-label="Kanban view"
          className="data-[state=on]:bg-accent data-[state=on]:text-foreground data-[state=on]:border-border"
        >
          <Columns3 className="size-3.5" />
          Board
        </ToggleGroupItem>
      </ToggleGroup>

      {/* Right — toolbar + CTA */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          aria-label="Board settings"
          onClick={onOpenSettings}
        >
          <Settings className="size-4" />
        </Button>
        {/* Single primary CTA — Acid Lime fill (design.md: one CTA per screen) */}
        <Button
          size="icon"
          className="ml-1 md:h-8 md:w-auto md:px-3"
          onClick={onNewTask}
          aria-label="New issue"
        >
          <Plus className="size-4" />
          <span className="hidden md:inline">New Issue</span>
        </Button>
      </div>
    </header>
  )
}