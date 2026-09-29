import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ProgressIcon, BacklogIcon } from './progress-icon';

describe('ProgressIcon', () => {
  it('renders a progress arc for numeric progress', () => {
    const { container } = render(<ProgressIcon progress={50} />);
    const arc = container.querySelector('circle[stroke-dasharray]');
    expect(arc).not.toBeNull();
    const circumference = 2 * Math.PI * 6;
    expect(arc!.getAttribute('stroke-dashoffset')).toBe(String(circumference * (1 - 0.5)));
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

  it("renders lucide's circle-x for cancelled type with null progress", () => {
    const { container } = render(<ProgressIcon progress={null} type="cancelled" />);
    expect(container.querySelector('.lucide-circle-x')).not.toBeNull();
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
