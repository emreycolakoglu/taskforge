/**
 * DetailAssigneeSelect — compact assignee picker (shadcn Select).
 *
 * Uses the shared radix Select primitive with a ghost-styled trigger. Trigger
 * shows the selected user's avatar initial + name (mirrored from the option via
 * SelectValue), or the "Unassigned" row when none is set.
 *
 * Radix Select forbids an empty-string item value, so "unassigned" uses a
 * sentinel value that is mapped back to `null` at the boundary.
 */

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { User } from "@/types";
import type { ReactNode } from "react";
import { UserIcon } from "lucide-react";

const UNASSIGNED = "__unassigned__";

const TRIGGER_CLASS =
  "h-8 w-auto gap-1.5 border-0 bg-transparent px-2 py-1 text-muted-foreground shadow-none hover:bg-accent hover:text-foreground [&>span]:flex [&>span]:items-center [&>span]:gap-1.5 [&_svg]:size-4";

interface DetailAssigneeSelectProps {
  value: string | null;
  users: User[];
  onChange: (id: string | null) => void;
}

function InitialAvatar({ children }: { children: ReactNode }) {
  return (
    <Avatar className="size-4 border-0">
      <AvatarFallback className="bg-muted text-[9px] font-semibold text-muted-foreground">
        {children}
      </AvatarFallback>
    </Avatar>
  );
}

export function DetailAssigneeSelect({
  value,
  users,
  onChange,
}: DetailAssigneeSelectProps) {
  return (
    <Select
      value={value ?? UNASSIGNED}
      onValueChange={(v) => onChange(v === UNASSIGNED ? null : v)}
    >
      <SelectTrigger className={TRIGGER_CLASS} aria-label="Assignee">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start">
        <SelectItem value={UNASSIGNED}>
          <span className="flex items-center gap-1.5">
            <InitialAvatar>
              <UserIcon className="size-3" />
            </InitialAvatar>
            Unassigned
          </span>
        </SelectItem>
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            <span className="flex items-center gap-1.5">
              <InitialAvatar>
                {u.displayName.charAt(0).toUpperCase()}
              </InitialAvatar>
              {u.displayName}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
