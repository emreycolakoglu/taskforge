/**
 * DetailStatusSelect — compact status picker (shadcn Select).
 *
 * Uses the shared radix Select primitive with a ghost-styled trigger so it
 * reads as an inline property row. SelectValue mirrors the selected status's
 * circle icon + name into the trigger.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Board, Task } from "@/types";
import { ReactElement } from "react";
import { CircleIcon } from "lucide-react";

const TRIGGER_CLASS =
  "h-8 w-auto gap-1.5 border-0 bg-transparent px-2 py-1 text-muted-foreground shadow-none hover:bg-accent hover:text-foreground [&>span]:flex [&>span]:items-center [&>span]:gap-1.5 [&_svg]:size-4";

interface DetailStatusSelectProps {
  task: Task;
  board: Board | undefined;
  onChange: (value: string) => void;
}

export const DetailStatusSelect = ({
  board,
  task,
  onChange,
}: DetailStatusSelectProps): ReactElement => {
  const statuses = board?.statuses ?? [];

  return (
    <Select value={task.statusId} onValueChange={onChange}>
      <SelectTrigger className={TRIGGER_CLASS} aria-label="Status">
        <SelectValue placeholder="Unknown status" />
      </SelectTrigger>
      <SelectContent align="start" className="[&_svg]:size-4">
        {statuses.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            <span className="flex items-center gap-1.5">
              <CircleIcon />
              {s.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
