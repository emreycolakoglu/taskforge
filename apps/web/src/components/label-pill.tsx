import type { Label } from '@/types'
import { cn } from '@/lib/utils'

/** Determines if text should be light or dark based on background luminance. */
function isLightColor(hex: string): boolean {
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  // Relative luminance formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.55
}

interface LabelPillProps {
  label: Label
  className?: string
  active?: boolean
  onClick?: () => void
}

export function LabelPill({ label, className, active, onClick }: LabelPillProps) {
  const textColor = isLightColor(label.color) ? 'text-gray-900' : 'text-white'

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none transition-all',
        textColor,
        active === undefined
          ? ''
          : active
            ? 'ring-2 ring-primary ring-offset-1 ring-offset-background'
            : 'opacity-50 hover:opacity-80',
        onClick && 'cursor-pointer',
        className,
      )}
      style={{ backgroundColor: label.color }}
    >
      {label.name}
    </button>
  )
}