/**
 * ProgressIcon — circular progress indicator as an inline SVG.
 *
 * Renders a ring with a filled arc proportional to `progress` (0-100).
 * Color changes by threshold: 0-30 red, 31-70 amber, 71-100 green.
 *
 * For null progress (cancelled/duplicate types), renders a filled gray circle
 * with a distinct glyph: a slash for cancelled, an inner ring for duplicate.
 *
 * Props:
 *   progress  — 0-100 percentage, or null for terminal non-progress types
 *   type      — optional status type for null-progress icon selection
 *   size      — viewBox size in px (default 16)
 *   className — optional Tailwind classes
 */
import type { FC } from 'react';
import type { StatusType } from '@/types';

interface ProgressIconProps {
  progress: number | null;
  type?: StatusType;
  size?: number;
  className?: string;
}

function progressColor(p: number): string {
  if (p <= 30) return '#EF4444'; // red
  if (p <= 70) return '#F59E0B'; // amber
  return '#22C55E'; // green
}

const GRAY = '#64748B';

export const ProgressIcon: FC<ProgressIconProps> = ({ progress, type, size = 16, className }) => {
  if (progress === null) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" className={className} aria-hidden="true">
        <circle cx="8" cy="8" r="6" fill={GRAY} opacity={0.3} />
        {type === 'cancelled' ? (
          <line
            x1="4"
            y1="4"
            x2="12"
            y2="12"
            stroke={GRAY}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        ) : (
          <circle cx="8" cy="8" r="2.5" fill="none" stroke={GRAY} strokeWidth="1.5" />
        )}
      </svg>
    );
  }

  const p = Math.max(0, Math.min(100, progress));
  const r = 6;
  const strokeWidth = 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - p / 100);
  const color = progressColor(p);

  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} aria-hidden="true">
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        opacity={0.15}
      />
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
  );
};
