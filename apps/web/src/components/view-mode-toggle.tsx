/**
 * ViewModeToggle — List | Board segmented toggle, shared by the board header
 * and the project page. Active state = Graphite (bg-accent), NOT Lime
 * (design.md conflict register #1: Lime is reserved for the screen's CTA).
 */

import { List, Columns3 } from 'lucide-react';
import type { ViewMode } from '@/hooks/use-board-view-state';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface ViewModeToggleProps {
  value: ViewMode;
  onValueChange: (mode: ViewMode) => void;
}

export function ViewModeToggle({ value, onValueChange }: ViewModeToggleProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => {
        if (v) onValueChange(v as ViewMode);
      }}
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
  );
}
