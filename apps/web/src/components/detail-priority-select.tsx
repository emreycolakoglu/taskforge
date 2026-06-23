/**
 * DetailPrioritySelect — compact Select for task priority with icon prefix.
 *
 * Replaces the old 4-button priority row which used Crimson/Indigo tinted
 * fills (bg-[#eb5757]/10) — a bright-fill pattern design.md discourages on
 * chrome (conflict register #1). A Select with icon-prefixed options is quieter
 * and matches Linear's single-row property. Icons carry color via stroke only;
 * the row stays monochrome.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { PriorityIcon } from './priority-icons'
import type { Task } from '@/types'

const PRIORITY_LABELS: Record<Task['priority'], string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
}

interface DetailPrioritySelectProps {
  value: Task['priority']
  onChange: (value: Task['priority']) => void
}

export function DetailPrioritySelect({ value, onChange }: DetailPrioritySelectProps) {
  const options: Task['priority'][] = ['low', 'medium', 'high', 'urgent']

  return (
    <Select value={value} onValueChange={(v) => onChange(v as Task['priority'])}>
      <SelectTrigger className="h-8 w-[140px] gap-1.5">
        <PriorityIcon priority={value} />
        <span className="text-sm">{PRIORITY_LABELS[value]}</span>
      </SelectTrigger>
      <SelectContent>
        {options.map((p) => (
          <SelectItem key={p} value={p}>
            <span className="flex items-center gap-1.5">
              <PriorityIcon priority={p} />
              {PRIORITY_LABELS[p]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}