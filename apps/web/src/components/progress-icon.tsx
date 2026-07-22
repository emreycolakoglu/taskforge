/**
 * ProgressIcon — circular progress indicator as an inline SVG.
 *
 * Renders a ring with a filled arc proportional to `progress` (0-100).
 * Color changes by threshold: 0-30 red, 31-70 amber, 71-100 green.
 *
 * Props:
 *   progress  — 0-100 percentage
 *   size      — viewBox size in px (default 16)
 *   className — optional Tailwind classes
 */
import type { FC } from 'react'

interface ProgressIconProps {
  progress: number
  size?: number
  className?: string
}

function progressColor(p: number): string {
  if (p <= 30) return '#EF4444'   // red
  if (p <= 70) return '#F59E0B'   // amber
  return '#22C55E'                 // green
}

export const ProgressIcon: FC<ProgressIconProps> = ({
  progress,
  size = 16,
  className,
}) => {
  const p = Math.max(0, Math.min(100, progress))
  const r = 6                      // radius
  const strokeWidth = 2
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - p / 100)
  const color = progressColor(p)

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={className}
      aria-hidden="true"
    >
      {/* Background ring */}
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        opacity={0.15}
      />
      {/* Progress arc */}
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 8 8)"
        style={{ transition: 'stroke-dashoffset 0.3s ease, stroke 0.3s ease' }}
      />
    </svg>
  )
}
