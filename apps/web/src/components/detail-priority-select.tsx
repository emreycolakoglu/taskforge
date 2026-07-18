/**
 * DetailPrioritySelect — compact priority picker (shadcn Select).
 *
 * Uses the shared radix Select primitive (same pattern as create-task-dialog),
 * with a ghost-styled trigger so it reads as an inline property row, not a
 * bordered form field. Each option carries a stroke-only signal icon; the row
 * stays monochrome per design.md (no bright priority fills). SelectValue mirrors
 * the selected option's icon + label into the trigger automatically.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Task } from "@/types";
import type { ReactElement } from "react";
import {
  SignalHighIcon,
  SignalLowIcon,
  SignalMediumIcon,
  SignalZero,
} from "lucide-react";

const PRIORITY_LABELS: Record<Task["priority"], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const PRIORITY_ICONS: Record<Task["priority"], ReactElement> = {
  low: <SignalZero />,
  medium: <SignalLowIcon />,
  high: <SignalMediumIcon />,
  urgent: <SignalHighIcon />,
};

const TRIGGER_CLASS =
  "h-8 w-auto gap-1.5 border-0 bg-transparent px-2 py-1 text-muted-foreground shadow-none hover:bg-accent hover:text-foreground [&>span]:flex [&>span]:items-center [&>span]:gap-1.5 [&_svg]:size-4";

interface DetailPrioritySelectProps {
  value: Task["priority"];
  onChange: (value: Task["priority"]) => void;
}

const OPTIONS: Task["priority"][] = ["low", "medium", "high", "urgent"];

export function DetailPrioritySelect({
  value,
  onChange,
}: DetailPrioritySelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as Task["priority"])}
    >
      <SelectTrigger className={TRIGGER_CLASS} aria-label="Priority">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" className="[&_svg]:size-4">
        {OPTIONS.map((p) => (
          <SelectItem key={p} value={p}>
            <span className="flex items-center gap-1.5">
              {PRIORITY_ICONS[p]}
              {PRIORITY_LABELS[p]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
