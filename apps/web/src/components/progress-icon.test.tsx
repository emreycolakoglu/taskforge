import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ProgressIcon, BacklogIcon, CancelledIcon } from './progress-icon';

describe('ProgressIcon', () => {
  it('renders a progress arc for numeric progress', () => {
    const { container } = render(<ProgressIcon progress={50} />);
    const arc = container.querySelector('circle[stroke-dasharray]');
    expect(arc).not.toBeNull();
    const circumference = 2 * Math.PI * 6;
    expect(arc!.getAttribute('stroke-dashoffset')).toBe(String(circumference * (1 - 0.5)));
  });

  it('uses the status color for the arc when provided', () => {
    const { container } = render(<ProgressIcon progress={50} color="#ff0000" />);
    const arc = container.querySelector('circle[stroke-dasharray]');
    expect(arc!.getAttribute('stroke')).toBe('#ff0000');
  });

  it('uses the status color for the full disc when provided', () => {
    const { container } = render(<ProgressIcon progress={100} color="#123456" />);
    const disc = container.querySelector('circle[fill]:not([stroke-dasharray])');
    expect(disc!.getAttribute('fill')).toBe('#123456');
  });

  it('falls back to threshold colors when no color is provided', () => {
    const { container } = render(<ProgressIcon progress={100} />);
    const disc = container.querySelector('circle[fill]:not([stroke-dasharray])');
    expect(disc!.getAttribute('fill')).toBe('#22C55E');
  });

  it('renders a solid disc for 100% progress', () => {
    const { container } = render(<ProgressIcon progress={100} />);
    const disc = container.querySelector('circle[fill]:not([stroke-dasharray])');
    expect(disc).not.toBeNull();
    expect(disc!.getAttribute('fill')).toBe('#22C55E');
    expect(container.querySelector('circle[stroke-dasharray]')).toBeNull();
  });

  it('renders a dotted circle for backlog type', () => {
    const { container } = render(<ProgressIcon progress={0} type="backlog" />);
    expect(container.querySelector('circle[stroke-dasharray="1.4 1.74"]')).not.toBeNull();
  });

  it('renders the custom cancelled glyph for cancelled type regardless of progress', () => {
    const { container } = render(<ProgressIcon progress={null} type="cancelled" />);
    // CancelledIcon: two rings (thin outer + thick inner arc) and the X path.
    expect(container.querySelectorAll('circle')).toHaveLength(2);
    expect(container.querySelector('path')).not.toBeNull();
  });

  it('renders an inner ring for duplicate type with null progress', () => {
    const { container } = render(<ProgressIcon progress={null} type="duplicate" />);
    expect(container.querySelector('.lucide-circle-x')).toBeNull();
    expect(container.querySelectorAll('circle')).toHaveLength(2);
  });

  it('renders the duplicate glyph when type is omitted with null progress', () => {
    const { container } = render(<ProgressIcon progress={null} />);
    expect(container.querySelector('.lucide-circle-x')).toBeNull();
    expect(container.querySelectorAll('circle')).toHaveLength(2);
  });
});

describe('Glyph size unification', () => {
  it('renders every glyph at identical viewBox 0 0 16 16', () => {
    const cases = [
      <ProgressIcon key="ring" progress={50} />,
      <ProgressIcon key="done" progress={100} type="done" />,
      <BacklogIcon key="backlog" />,
      <CancelledIcon key="cancelled" />,
    ];
    for (const c of cases) {
      const { container } = render(c);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('viewBox')).toBe('0 0 16 16');
      expect(svg.getAttribute('width')).toBe('16');
      expect(svg.getAttribute('height')).toBe('16');
    }
  });

  it('renders CancelledIcon at the requested size', () => {
    const { container } = render(<CancelledIcon size={14} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('14');
    expect(svg.getAttribute('height')).toBe('14');
    expect(svg.getAttribute('viewBox')).toBe('0 0 16 16');
  });

  it('uses design-token Slate for CancelledIcon strokes, not hard-coded greys', () => {
    const { container } = render(<CancelledIcon />);
    const strokes = Array.from(container.querySelectorAll('circle[stroke]')).map((c) =>
      c.getAttribute('stroke'),
    );
    expect(strokes).toHaveLength(2);
    for (const s of strokes) expect(s).toBe('#64748B');
  });

  it('respects the status color for CancelledIcon strokes', () => {
    const { container } = render(<CancelledIcon color="#ff0000" />);
    const strokes = Array.from(container.querySelectorAll('circle[stroke]')).map((c) =>
      c.getAttribute('stroke'),
    );
    for (const s of strokes) expect(s).toBe('#ff0000');
  });

  it('ProgressIcon forwards the status color into the cancelled glyph', () => {
    const { container } = render(<ProgressIcon progress={null} type="cancelled" color="#8b5cf6" />);
    const strokes = Array.from(container.querySelectorAll('circle[stroke]')).map((c) =>
      c.getAttribute('stroke'),
    );
    for (const s of strokes) expect(s).toBe('#8b5cf6');
  });
});

describe('BacklogIcon', () => {
  it('renders a dotted circle', () => {
    const { container } = render(<BacklogIcon />);
    const ring = container.querySelector('circle[stroke-dasharray="1.4 1.74"]');
    expect(ring).not.toBeNull();
    expect(ring!.getAttribute('stroke')).toBe('#8a8f98');
  });

  it('renders an inner dot arc', () => {
    const { container } = render(<BacklogIcon />);
    expect(container.querySelectorAll('circle')).toHaveLength(2);
  });
});
