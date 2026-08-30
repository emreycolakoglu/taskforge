import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ProgressIcon } from './progress-icon';

describe('ProgressIcon', () => {
  it('renders a progress arc for numeric progress', () => {
    const { container } = render(<ProgressIcon progress={50} />);
    const arc = container.querySelector('circle[stroke-dasharray]');
    expect(arc).not.toBeNull();
    const circumference = 2 * Math.PI * 6;
    expect(arc!.getAttribute('stroke-dashoffset')).toBe(String(circumference * (1 - 0.5)));
  });

  it('renders a slash for cancelled type with null progress', () => {
    const { container } = render(<ProgressIcon progress={null} type="cancelled" />);
    expect(container.querySelector('line')).not.toBeNull();
    expect(container.querySelectorAll('circle')).toHaveLength(1);
  });

  it('renders an inner ring for duplicate type with null progress', () => {
    const { container } = render(<ProgressIcon progress={null} type="duplicate" />);
    expect(container.querySelector('line')).toBeNull();
    expect(container.querySelectorAll('circle')).toHaveLength(2);
  });

  it('renders the duplicate glyph when type is omitted with null progress', () => {
    const { container } = render(<ProgressIcon progress={null} />);
    expect(container.querySelector('line')).toBeNull();
    expect(container.querySelectorAll('circle')).toHaveLength(2);
  });
});
