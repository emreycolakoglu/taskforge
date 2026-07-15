/**
 * DetailPrioritySelect — compact Select for task priority with icon prefix.
 *
 * Replaces the old 4-button priority row which used Crimson/Indigo tinted
 * fills (bg-[#eb5757]/10) — a bright-fill pattern design.md discourages on
 * chrome (conflict register #1). A Select with icon-prefixed options is quieter
 * and matches Linear's single-row property. Icons carry color via stroke only;
 * the row stays monochrome.
 */

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  low: <SignalZero data-icon="inline-start" />,
  medium: <SignalLowIcon data-icon="inline-start" />,
  high: <SignalMediumIcon data-icon="inline-start" />,
  urgent: <SignalHighIcon data-icon="inline-start" />,
};

interface DetailPrioritySelectProps {
  value: Task["priority"];
  onChange: (value: Task["priority"]) => void;
}

export function DetailPrioritySelect({
  value,
  onChange,
}: DetailPrioritySelectProps) {
  const options: Task["priority"][] = ["low", "medium", "high", "urgent"];

  return (
    <div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={"ghost"} size={"sm"}>
            {PRIORITY_ICONS[value]}
            {PRIORITY_LABELS[value]}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            {options.map((p) => (
              <DropdownMenuItem key={p} onClick={() => onChange(p)}>
                {PRIORITY_ICONS[p]}
                {PRIORITY_LABELS[p]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
