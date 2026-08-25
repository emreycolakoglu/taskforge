import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetailEstimateInput } from './detail-estimate-input';

describe('DetailEstimateInput', () => {
  it('renders the current estimate', () => {
    render(<DetailEstimateInput value={5} onChange={() => {}} />);
    expect(screen.getByDisplayValue('5')).toBeInTheDocument();
  });

  it('renders empty when no estimate is set', () => {
    render(<DetailEstimateInput value={null} onChange={() => {}} />);
    expect(screen.getByPlaceholderText(/estimate/i)).toBeInTheDocument();
  });

  it('calls onChange with the parsed number on blur', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DetailEstimateInput value={null} onChange={onChange} />);
    const input = screen.getByPlaceholderText(/estimate/i);
    await user.type(input, '3');
    await user.tab();
    expect(onChange).toHaveBeenCalledWith(3);
  });
});
