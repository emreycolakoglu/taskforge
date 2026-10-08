/**
 * UserSelect — form-field user picker (shadcn Select with avatar initials).
 *
 * Extracted from CreateTaskDialog's assignee field so the project lead
 * pickers (create + edit project dialogs) use the same member UI. Options come
 * from the public user directory. Radix Select forbids an empty-string item
 * value, so the "none" row uses a sentinel mapped back to `null`.
 *
 * For the compact ghost-styled picker on the task detail sidebar, see
 * DetailAssigneeSelect.
 */
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AssigneeOption } from '@/components/detail-assignee-select';

const NONE = '__none__';

interface UserSelectProps {
  value: string | null;
  users: AssigneeOption[];
  onChange: (id: string | null) => void;
  /** Label of the "nobody" row. */
  noneLabel?: string;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  className?: string;
}

export function UserSelect({
  value,
  users,
  onChange,
  noneLabel = 'Unassigned',
  placeholder,
  id,
  ariaLabel,
  className = 'flex-1',
}: UserSelectProps) {
  const selectedUser = users.find((u) => u.id === value) ?? null;
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
      <SelectTrigger id={id} className={className} aria-label={ariaLabel}>
        <Avatar className="size-5 border-0">
          <AvatarFallback className="text-[9px] font-semibold bg-muted text-muted-foreground">
            {selectedUser ? selectedUser.displayName.charAt(0).toUpperCase() : '+'}
          </AvatarFallback>
        </Avatar>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{noneLabel}</SelectItem>
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
  );
}
