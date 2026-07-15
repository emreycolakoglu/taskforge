import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Board, Task } from "@/types";
import { ReactElement } from "react";
import { Button } from "./ui/button";
import { CircleIcon } from "lucide-react";

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
  const statusName =
    board?.statuses?.find((s) => s.id === task.statusId)?.name ??
    "Unknown status";

  return (
    <div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={"ghost"} size={"sm"}>
            <CircleIcon data-icon="inline-start" />
            {statusName}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            {board?.statuses?.map((p) => (
              <DropdownMenuItem key={p.id} onClick={() => onChange(p.id)}>
                {p.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
