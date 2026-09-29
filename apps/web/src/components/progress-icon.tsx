/**
 * ProgressIcon — circular progress indicator as an inline SVG.
 *
 * Renders a ring with a filled arc proportional to `progress` (0-100).
 * Color changes by threshold: 0-30 red, 31-70 amber, 71-100 green.
 * A full ring (100) renders as a solid filled disc; a zero-progress ring
 * (0) renders as a hollow circle outline.
 *
 * For null progress (cancelled/duplicate types), renders a filled gray circle
 * with a distinct glyph: an X for cancelled (CircleX-style), an inner ring
 * for duplicate.
 *
 * Props:
 *   progress  — 0-100 percentage, or null for terminal non-progress types
 *   type      — optional status type for null-progress icon selection
 *   size      — viewBox size in px (default 16)
 *   className — optional Tailwind classes
 */
import type { FC } from 'react';
import { CircleXIcon } from 'lucide-react';
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
const FOG = '#8a8f98'; // design.md Fog — muted icon strokes
const DOTTED_R = 6;
const DOTTED_CIRCUMFERENCE = 2 * Math.PI * DOTTED_R;

export const ProgressIcon: FC<ProgressIconProps> = ({ progress, type, size = 16, className }) => {
  if (progress === null) {
    if (type === 'cancelled') {
      return (
        <CircleXIcon
          size={size}
          className={className}
          aria-hidden="true"
          strokeWidth={1.5}
          style={{ color: GRAY }}
        />
      );
    }
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" className={className} aria-hidden="true">
        <circle cx="8" cy="8" r="6" fill={GRAY} opacity={0.3} />
        <circle cx="8" cy="8" r="2.5" fill="none" stroke={GRAY} strokeWidth="1.5" />
      </svg>
    );
  }

  const p = Math.max(0, Math.min(100, progress));

  // Backlog statuses get the dotted "unscheduled" circle
  if (type === 'backlog') {
    return <BacklogIcon size={size} className={className} />;
  }

  // Full ring — solid filled disc
  if (p >= 100) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" className={className} aria-hidden="true">
        <circle cx="8" cy="8" r={6} fill={progressColor(p)} />
      </svg>
    );
  }

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

/**
 * BacklogIcon — dotted circle used for backlog statuses, matching Linear's
 * "unscheduled" glyph: a hollow dotted ring with a small inner dot.
 * Also returned by ProgressIcon for `type="backlog"`.
 */
export const BacklogIcon: FC<{ size?: number; className?: string }> = ({
  size = 16,
  className,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle
        cx="7"
        cy="7"
        r={DOTTED_R}
        fill="none"
        stroke={FOG}
        strokeWidth="1.5"
        strokeDasharray="1.4 1.74"
        strokeDashoffset="0.65"
      />
      <circle
        cx="7"
        cy="7"
        r="2"
        fill="none"
        stroke={FOG}
        strokeWidth="4"
        strokeDasharray={`${DOTTED_CIRCUMFERENCE / 2} ${DOTTED_CIRCUMFERENCE}`}
        strokeDashoffset={DOTTED_CIRCUMFERENCE / 2}
        transform="rotate(-90 7 7)"
      />
    </svg>
  );
};
