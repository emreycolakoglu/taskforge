/**
 * PriorityIcons — shared lucide-react icons for task priority.
 *
 * Single source for priority iconography across the board card, the task
 * detail view, and the priority Select. Color is inherited via `currentColor`
 * — the consumer wraps the icon in a span with the appropriate text color
 * (Crimson for urgent/high, Indigo for medium, muted-foreground for low) per
 * design.md's semantic-accent rule. No tinted background fills — icons only
 * carry stroke color.
 *
 * Icons (alert + directional chevrons, coherent high→low):
 *   urgent  — OctagonAlert (alert octagon, breaks the set to signal danger)
 *   high    — ChevronUp    (points up)
 *   medium  — Minus        (neutral, level)
 *   low     — ChevronDown  (points down)
 */

import { ChevronDown, ChevronUp, Minus, OctagonAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Task } from '@/types'

const PRIORITY_ICONS: Record<Task['priority'], LucideIcon> = {
  urgent: OctagonAlert,
  high: ChevronUp,
  medium: Minus,
  low: ChevronDown,
}

const PRIORITY_COLORS: Record<Task['priority'], string> = {
  urgent: 'text-[#eb5757]',
  high: 'text-[#eb5757]',
  medium: 'text-[#5e6ad2]',
  low: 'text-muted-foreground',
}

const PRIORITY_LABELS: Record<Task['priority'], string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

interface PriorityIconProps {
  priority: Task['priority']
  /** Tailwind classes applied to the wrapping span (overrides default color). */
  className?: string
  /** Icon size in px. Defaults to 14 (compact card/select contexts). */
  size?: number
}

/** Renders the icon for a given priority, colored per design.md semantic accents. */
export function PriorityIcon({ priority, className, size = 14 }: PriorityIconProps) {
  const Icon = PRIORITY_ICONS[priority]
  return (
    <span
      title={PRIORITY_LABELS[priority]}
      className={className ?? `${PRIORITY_COLORS[priority]} shrink-0`}
    >
      <Icon size={size} strokeWidth={2} />
    </span>
  )
}