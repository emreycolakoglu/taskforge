/**
 * DetailPropertyRow — layout wrapper for a single sidebar property.
 *
 * Label left (muted, sentence case per design.md conflict register #9),
 * value/control right. Clickable rows (Parent, Sub-issues count) get a subtle
 * Graphite hover affordance. Avoids repeating the row layout 8 times.
 */

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface DetailPropertyRowProps {
  label: string
  children: ReactNode
  onClick?: () => void
  className?: string
}

export function DetailPropertyRow({ label, children, onClick, className }: DetailPropertyRowProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 py-2 group',
        onClick && 'cursor-pointer hover:bg-accent/30 -mx-2 px-2 rounded',
        className,
      )}
      onClick={onClick}
    >
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="flex items-center gap-1.5 text-sm text-foreground min-w-0 justify-end">
        {children}
      </div>
    </div>
  )
}