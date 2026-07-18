/**
 * FilterChipsBar — conditional filter row shown only when filters are active.
 *
 * Replaces the old always-on label-pill toggle bar. Active filters render as
 * outline Badge chips with an × remove. "+ Add filter" opens a Popover with the
 * board's labels as checkboxes. "Clear all" sits at the right when filters exist.
 * No Lime anywhere here — all muted/Graphite per design.md.
 */

import { Plus, X, SlidersHorizontal } from 'lucide-react'
import type { Label } from '@/types'
import type { FilterState } from '@/hooks/use-board-view-state'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { LabelOptionList } from './label-option-list'
import { cn } from '@/lib/utils'

interface FilterChipsBarProps {
  filters: FilterState
  labels: Label[]
  onToggleLabel: (labelId: string) => void
  onRemoveLabel: (labelId: string) => void
  onClear: () => void
}

export function FilterChipsBar({
  filters,
  labels,
  onToggleLabel,
  onRemoveLabel,
  onClear,
}: FilterChipsBarProps) {
  const activeLabels = labels.filter((l) => filters.labelIds.includes(l.id))
  const hasFilters = activeLabels.length > 0

  return (
    <div className="flex h-9 items-center gap-2 px-6 border-b border-border bg-background shrink-0">
      <SlidersHorizontal className="size-3.5 text-muted-foreground shrink-0" />

      {activeLabels.map((label) => (
        <Badge
          key={label.id}
          variant="outline"
          className={cn(
            'inline-flex items-center gap-1 rounded-sm border-border px-2 py-0.5 text-xs text-muted-foreground',
          )}
        >
          <span
            className="size-2 rounded-sm shrink-0"
            style={{ backgroundColor: label.color }}
          />
          {label.name}
          <button
            type="button"
            aria-label={`Remove ${label.name} filter`}
            onClick={() => onRemoveLabel(label.id)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}

      {/* + Add filter popover */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-3" />
            Add filter
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-2">
          <div className="text-xs font-medium text-muted-foreground mb-1.5">Filter by label</div>
          <LabelOptionList
            labels={labels}
            isSelected={(id) => filters.labelIds.includes(id)}
            onToggle={onToggleLabel}
          />
        </PopoverContent>
      </Popover>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground ml-auto"
          onClick={onClear}
        >
          <X className="size-3 mr-1" />
          Clear all
        </Button>
      )}
    </div>
  )
}