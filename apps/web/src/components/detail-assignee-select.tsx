/**
 * DetailAssigneeSelect — compact Select for task assignee with avatar initial.
 *
 * Trigger shows an Avatar (size-5) with the assignee's initial, or a "+"
 * placeholder when unassigned. Options show avatar + name.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { User } from '@/types'

interface DetailAssigneeSelectProps {
  value: string | null
  users: User[]
  onChange: (id: string | null) => void
}

export function DetailAssigneeSelect({ value, users, onChange }: DetailAssigneeSelectProps) {
  const selectedUser = users.find((u) => u.id === value) ?? null

  return (
    <Select
      value={value ?? '__none__'}
      onValueChange={(v) => onChange(v === '__none__' ? null : v)}
    >
      <SelectTrigger className="h-8 w-[140px] gap-1.5">
        <Avatar className="size-5 border-0">
          <AvatarFallback className="text-[9px] font-semibold bg-muted text-muted-foreground">
            {selectedUser
              ? selectedUser.displayName.charAt(0).toUpperCase()
              : '+'}
          </AvatarFallback>
        </Avatar>
        <span className="text-sm truncate">
          {selectedUser ? selectedUser.displayName : 'Unassigned'}
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Unassigned</SelectItem>
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            <span className="flex items-center gap-1.5">
              <Avatar className="size-5 border-0">
                <AvatarFallback className="text-[9px] font-semibold bg-muted text-muted-foreground">
                  {u.displayName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {u.displayName}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}