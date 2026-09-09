/**
 * FilterChipsBar — conditional filter row shown only when filters are active.
 *
 * Replaces the old always-on label-pill toggle bar. Active filters render as
 * outline Badge chips with an × remove (labels + assignees). "+ Add filter"
 * opens a Popover with two sections: label checkboxes and assignee checkboxes
 * (from the user directory). "Clear all" sits at the right when filters exist.
 * No Lime anywhere here — all muted/Graphite per design.md.
 */

import { Plus, X, SlidersHorizontal } from 'lucide-react';
import type { Label } from '@/types';
import type { FilterState } from '@/hooks/use-board-view-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LabelOptionList } from './label-option-list';
import { SaveViewTrigger } from './save-view-trigger';

interface FilterChipsBarProps {
  filters: FilterState;
  labels: Label[];
  assignees: { id: string; displayName: string }[];
  onToggleLabel: (labelId: string) => void;
  onToggleAssignee: (userId: string) => void;
  onRemoveFilter: (id: string, kind: 'label' | 'assignee') => void;
  onClear: () => void;
  onSaveAsView?: () => void;
}

export function FilterChipsBar({
  filters,
  labels,
  assignees,
  onToggleLabel,
  onToggleAssignee,
  onRemoveFilter,
  onClear,
  onSaveAsView,
}: FilterChipsBarProps) {
  const activeLabels = labels.filter((l) => filters.labelIds.includes(l.id));
  const hasFilters = activeLabels.length > 0 || filters.assigneeIds.length > 0;

  return (
    <div className="flex h-9 items-center gap-2 px-6 border-b border-border bg-background shrink-0">
      <SlidersHorizontal className="size-3.5 text-muted-foreground shrink-0" />

      {activeLabels.map((label) => (
        <Badge
          key={label.id}
          variant="outline"
          className="inline-flex items-center gap-1 rounded-sm border-border px-2 py-0.5 text-xs text-muted-foreground"
        >
          <span className="size-2 rounded-sm shrink-0" style={{ backgroundColor: label.color }} />
          {label.name}
          <button
            type="button"
            aria-label={`Remove ${label.name} filter`}
            onClick={() => onRemoveFilter(label.id, 'label')}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}

      {filters.assigneeIds.map((assigneeId) => {
        const assignee = assignees.find((a) => a.id === assigneeId);
        if (!assignee) return null;
        return (
          <Badge
            key={assigneeId}
            variant="outline"
            className="inline-flex items-center gap-1 rounded-sm border-border px-2 py-0.5 text-xs text-muted-foreground"
          >
            <span className="flex size-3 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-[8px] font-semibold">
              {assignee.displayName.charAt(0).toUpperCase()}
            </span>
            {assignee.displayName}
            <button
              type="button"
              aria-label={`Remove ${assignee.displayName} filter`}
              onClick={() => onRemoveFilter(assigneeId, 'assignee')}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </Badge>
        );
      })}

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
          <div className="text-xs font-medium text-muted-foreground mb-1.5">Label</div>
          <LabelOptionList
            labels={labels}
            isSelected={(id) => filters.labelIds.includes(id)}
            onToggle={onToggleLabel}
          />
          <div className="mt-2 border-t border-border pt-1.5" />
          <div className="text-xs font-medium text-muted-foreground mb-1.5">Assignee</div>
          {assignees.length === 0 ? (
            <p className="py-1 text-xs text-muted-foreground">No users yet</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {assignees.map((assignee) => (
                <label
                  key={assignee.id}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
                >
                  <Checkbox
                    checked={filters.assigneeIds.includes(assignee.id)}
                    onCheckedChange={() => onToggleAssignee(assignee.id)}
                  />
                  <span className="flex size-3 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-[8px] font-semibold">
                    {assignee.displayName.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate">{assignee.displayName}</span>
                </label>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={onClear}
        >
          <X className="size-3 mr-1" />
          Clear all
        </Button>
      )}

      {onSaveAsView && (
        <div className="ml-auto flex items-center">
          <SaveViewTrigger onClick={onSaveAsView} />
        </div>
      )}
    </div>
  );
}
