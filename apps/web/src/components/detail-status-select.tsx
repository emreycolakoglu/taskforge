/**
 * DetailStatusSelect — compact Select for task status with a status dot.
 *
 * design.md conflict register #2: status dot uses only Emerald (done),
 * Slate (active), Fog (archived) — no blue/purple. The dot renders inside the
 * trigger value, which bare SelectValue doesn't do cleanly, hence the wrapper.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import type { Task } from '@/types'

const STATUS_COLORS: Record<Task['status'], string> = {
  done: '#27a644',
  active: '#62666d',
  archived: '#8a8f98',
}

const STATUS_LABELS: Record<Task['status'], string> = {
  active: 'Active',
  done: 'Done',
  archived: 'Archived',
}

function StatusDot({ status }: { status: Task['status'] }) {
  return (
    <span
      className="size-2 rounded-full shrink-0"
      style={{ backgroundColor: STATUS_COLORS[status] }}
    />
  )
}

interface DetailStatusSelectProps {
  value: Task['status']
  onChange: (value: Task['status']) => void
}

export function DetailStatusSelect({ value, onChange }: DetailStatusSelectProps) {
  const options: Task['status'][] = ['active', 'done', 'archived']

  return (
    <Select value={value} onValueChange={(v) => onChange(v as Task['status'])}>
      <SelectTrigger className="h-8 w-[140px] gap-1.5">
        <StatusDot status={value} />
        <span className="text-sm">{STATUS_LABELS[value]}</span>
      </SelectTrigger>
      <SelectContent>
        {options.map((s) => (
          <SelectItem key={s} value={s}>
            <span className="flex items-center gap-1.5">
              <StatusDot status={s} />
              {STATUS_LABELS[s]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}