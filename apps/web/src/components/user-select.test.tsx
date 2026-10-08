/**
 * UserSelect — the form-field user picker shared by the task assignee field
 * and the project lead field. The "none" row maps to explicit null so callers
 * can tell "cleared" apart from "untouched".
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserSelect } from './user-select';

const users = [
  { id: 'u1', displayName: 'Ada Lovelace' },
  { id: 'u2', displayName: 'Grace Hopper' },
];

describe('UserSelect', () => {
  it('shows the selected user, or the none label when unset', () => {
    const { rerender } = render(
      <UserSelect
        value={null}
        users={users}
        onChange={() => {}}
        noneLabel="No lead"
        ariaLabel="Lead"
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Lead' })).toHaveTextContent('No lead');
    rerender(
      <UserSelect
        value="u2"
        users={users}
        onChange={() => {}}
        noneLabel="No lead"
        ariaLabel="Lead"
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Lead' })).toHaveTextContent('Grace Hopper');
  });

  it('fires onChange with the picked user id', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<UserSelect value={null} users={users} onChange={onChange} ariaLabel="Lead" />);
    await user.click(screen.getByRole('combobox', { name: 'Lead' }));
    await user.click(await screen.findByRole('option', { name: /ada lovelace/i }));
    expect(onChange).toHaveBeenCalledWith('u1');
  });

  it('maps the none row back to null', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <UserSelect
        value="u1"
        users={users}
        onChange={onChange}
        noneLabel="No lead"
        ariaLabel="Lead"
      />,
    );
    await user.click(screen.getByRole('combobox', { name: 'Lead' }));
    await user.click(await screen.findByRole('option', { name: /no lead/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
