/**
 * DetailAssigneeSelect — compact Select for task assignee with avatar initial.
 *
 * Trigger shows an Avatar (size-5) with the assignee's initial, or a "+"
 * placeholder when unassigned. Options show avatar + name.
 */

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { User } from "@/types";
import { UserIcon } from "lucide-react";

interface DetailAssigneeSelectProps {
  value: string | null;
  users: User[];
  onChange: (id: string | null) => void;
}

export function DetailAssigneeSelect({
  value,
  users,
  onChange,
}: DetailAssigneeSelectProps) {
  const selectedUser = users.find((u) => u.id === value) ?? null;

  return (
    <div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={"ghost"} size={"sm"}>
            <Avatar className="size-4 border-0">
              <AvatarFallback className="text-[9px] font-semibold bg-muted text-muted-foreground">
                {selectedUser ? (
                  selectedUser.displayName.charAt(0).toUpperCase()
                ) : (
                  <UserIcon data-icon="inline-start" />
                )}
              </AvatarFallback>
            </Avatar>

            {selectedUser ? selectedUser.displayName : "Select assignee"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => onChange(null)}>
              <Avatar className="size-4 border-0">
                <AvatarFallback className="text-[9px] font-semibold bg-muted text-muted-foreground">
                  <UserIcon data-icon="inline-start" />
                </AvatarFallback>
              </Avatar>
              Unassigned
            </DropdownMenuItem>
            {users.map((u) => (
              <DropdownMenuItem key={u.id} onClick={() => onChange(u.id)}>
                <Avatar className="size-4 border-0">
                  <AvatarFallback className="text-[9px] font-semibold bg-muted text-muted-foreground">
                    {u.displayName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {u.displayName}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
