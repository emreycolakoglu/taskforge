/**
 * TaskPickerPopover — searchable single-select task picker.
 *
 * Shared by "Set parent" (detail-add-parent-popover) and "Add relation"
 * (detail-add-relation-popover). cmdk owns the text filtering (matches on task
 * number + title); callers pass an already-narrowed `tasks` list — self, cycle
 * and existing-parent exclusions are the caller's concern, not this component's.
 */

import { useState } from "react";
import { Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from "@/components/ui/command";
import type { Task } from "@/types";

interface TaskPickerPopoverProps {
  tasks: Task[];
  onSelect: (id: string) => void;
  triggerLabel: string;
  placeholder?: string;
}

export function TaskPickerPopover({
  tasks,
  onSelect,
  triggerLabel,
  placeholder = "Search tasks…",
}: TaskPickerPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
        >
          <Plus />
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>No tasks found</CommandEmpty>
            {tasks.map((t) => (
              <CommandItem
                key={t.id}
                value={`${t.taskNumber ?? ""} ${t.title}`}
                onSelect={() => {
                  onSelect(t.id);
                  setOpen(false);
                }}
              >
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {t.taskNumber}
                </span>
                <span className="truncate text-foreground">{t.title}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
