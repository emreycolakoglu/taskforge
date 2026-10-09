import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ViewModeToggle } from './view-mode-toggle';

describe('ViewModeToggle', () => {
  it('marks the current mode as pressed', () => {
    render(<ViewModeToggle value="kanban" onValueChange={vi.fn()} />);

    expect(screen.getByRole('radio', { name: 'Kanban view' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'List view' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('reports a switch and ignores re-clicking the active mode', async () => {
    const onValueChange = vi.fn();
    render(<ViewModeToggle value="list" onValueChange={onValueChange} />);

    await userEvent.click(screen.getByRole('radio', { name: 'List view' }));
    expect(onValueChange).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('radio', { name: 'Kanban view' }));
    expect(onValueChange).toHaveBeenCalledWith('kanban');
  });
});
