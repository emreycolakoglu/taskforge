/**
 * ProgressIcon — circular progress indicator as an inline SVG.
 *
 * Renders a ring with a filled arc proportional to `progress` (0-100).
 * Color comes from the status's own color; falls back to red/amber/green
 * thresholds when no status color is set.
 * A full ring (100) renders as a solid filled disc; a zero-progress ring
 * (0) renders as a hollow circle outline.
 *
 * For null progress (duplicate type), renders a filled gray circle with an
 * inner ring. Cancelled type gets the dedicated CancelledIcon glyph.
 *
 * Props:
 *   progress  — 0-100 percentage, or null for terminal non-progress types
 *   type      — optional status type for null-progress icon selection
 *   color     — optional status color; drives the arc/disc color (Linear-style
 *               custom status colors). Falls back to red/amber/green thresholds
 *               based on progress when omitted.
 *   size      — viewBox size in px (default 16)
 *   className — optional Tailwind classes
 */
import type { FC } from 'react';
import type { StatusType } from '@/types';

interface ProgressIconProps {
  progress: number | null;
  type?: StatusType;
  color?: string | null;
  size?: number;
  className?: string;
}

interface GlyphIconProps {
  size?: number;
  className?: string;
  color?: string | null;
}

function progressColor(p: number, color?: string | null): string {
  if (color) return color;
  if (p <= 30) return '#EF4444'; // red
  if (p <= 70) return '#F59E0B'; // amber
  return '#22C55E'; // green
}

const GRAY = '#64748B';
const FOG = '#8a8f98'; // design.md Fog — muted icon strokes
const DOTTED_R = 6;
const DOTTED_CIRCUMFERENCE = 2 * Math.PI * DOTTED_R;
// Circumference of the r=3 inner arc in CancelledIcon (2π·3).
const CANCEL_ARC_LENGTH = 2 * Math.PI * 3;

export const ProgressIcon: FC<ProgressIconProps> = ({
  progress,
  type,
  color,
  size = 16,
  className,
}) => {
  // Cancelled gets its own glyph regardless of progress — cancelled statuses
  // always carry null progress, so this check must precede the null branch.
  if (type === 'cancelled') {
    return <CancelledIcon size={size} className={className} color={color} />;
  }

  if (progress === null) {
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
        <circle cx="8" cy="8" r={6} fill={progressColor(p, color)} />
      </svg>
    );
  }

  const r = 6;
  const strokeWidth = 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - p / 100);
  const color2 = progressColor(p, color);

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
        stroke={color2}
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
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8"
        r={DOTTED_R}
        fill="none"
        stroke={FOG}
        strokeWidth="1.5"
        strokeDasharray="1.4 1.74"
        strokeDashoffset="0.65"
      />
      <circle
        cx="8"
        cy="8"
        r="2"
        fill="none"
        stroke={FOG}
        strokeWidth="4"
        strokeDasharray={`${DOTTED_CIRCUMFERENCE / 2} ${DOTTED_CIRCUMFERENCE}`}
        strokeDashoffset={DOTTED_CIRCUMFERENCE / 2}
        transform="rotate(-90 8 8)"
      />
    </svg>
  );
};

/**
 * CancelledIcon — Linear-style cancelled glyph: a thin outer ring, a thick
 * inner arc (wide-stroke half-circle), and an X cross at the center. The
 * source art is drawn for a 14-unit box centered at (7,7); a translate(1 1)
 * group recenters it into the shared 16-unit viewBox so it aligns with all
 * other status glyphs. `color` (the status color from settings) drives the
 * ring strokes, falling back to the design-token Slate like the other glyphs.
 */
export const CancelledIcon: FC<GlyphIconProps> = ({ size = 16, className, color }) => {
  const stroke = color ?? GRAY;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <g transform="translate(1 1)">
        {/* Thin outer ring — dimmed to read as a secondary stroke */}
        <circle cx="7" cy="7" r="6" fill="none" stroke={stroke} strokeWidth="1.5" opacity={0.55} />
        {/* Thick inner arc — half-circle via dasharray, same geometry as Linear's */}
        <circle
          cx="7"
          cy="7"
          r="3"
          fill="none"
          stroke={stroke}
          strokeWidth="6"
          strokeDasharray={`${CANCEL_ARC_LENGTH} ${CANCEL_ARC_LENGTH}`}
          transform="rotate(-90 7 7)"
        />
        {/* X cross at the center — dark glyph punching through the ring */}
        <path
          stroke="none"
          fill="lch(9.471% 6.568 282.863)"
          d="M3.73657 3.73657C4.05199 3.42114 4.56339 3.42114 4.87881 3.73657L5.93941 4.79716L7 5.85775L9.12117 3.73657C9.4366 3.42114 9.94801 3.42114 10.2634 3.73657C10.5789 4.05199 10.5789 4.56339 10.2634 4.87881L8.14225 7L10.2634 9.12118C10.5789 9.4366 10.5789 9.94801 10.2634 10.2634C9.94801 10.5789 10.5789 9.94801 9.12117 10.2634L7 8.14225L4.87881 10.2634C4.56339 10.5789 4.05199 10.5789 3.73657 10.2634C3.42114 9.94801 3.42114 9.4366 3.73657 9.12118L4.79716 8.06059L5.85775 7L3.73657 4.87881C3.42114 4.56339 3.42114 4.05199 3.73657 3.73657Z"
        />
      </g>
    </svg>
  );
};
