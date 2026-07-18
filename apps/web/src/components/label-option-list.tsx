/**
 * LabelOptionList — multi-select list of board labels with real checkboxes.
 *
 * Shared body for the filter bar's "Add filter" popover and the task-card
 * LabelManager. Replaces the old hand-rolled rows that faked a checkbox with a
 * trailing "✓" glyph. Each row is a <label> wrapping a Checkbox (valid markup —
 * no nested buttons); clicking anywhere on the row toggles. The row stops click
 * propagation so it is safe to mount inside a clickable task card.
 */

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { Label } from "@/types";

interface LabelOptionListProps {
  labels: Label[];
  isSelected: (id: string) => boolean;
  onToggle: (id: string) => void;
  isPending?: (id: string) => boolean;
  emptyText?: string;
}

export function LabelOptionList({
  labels,
  isSelected,
  onToggle,
  isPending,
  emptyText = "No labels on this board",
}: LabelOptionListProps) {
  if (labels.length === 0) {
    return <p className="py-1 text-xs text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {labels.map((label) => {
        const pending = isPending?.(label.id) ?? false;
        return (
          <label
            key={label.id}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent",
              pending && "pointer-events-none opacity-50",
            )}
          >
            <Checkbox
              checked={isSelected(label.id)}
              disabled={pending}
              onCheckedChange={() => onToggle(label.id)}
            />
            <span
              className="size-3 shrink-0 rounded-sm"
              style={{ backgroundColor: label.color }}
            />
            <span className="truncate">{label.name}</span>
          </label>
        );
      })}
    </div>
  );
}
