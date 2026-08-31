import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ViewSelector } from './view-selector';
import type { View } from '@/types';

const views: View[] = [
  {
    id: 'v1',
    boardId: 'b1',
    userId: 'u-owner',
    isShared: true,
    name: 'Team urgent',
    filters: {},
    groupBy: 'status',
    sortBy: 'position',
    layout: 'board',
    position: 0,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'v2',
    boardId: 'b1',
    userId: 'u-me',
    isShared: false,
    name: 'Mine',
    filters: {},
    groupBy: 'status',
    sortBy: 'position',
    layout: 'board',
    position: 1,
    createdAt: '',
    updatedAt: '',
  },
];

vi.mock('@/hooks/use-views', () => ({
  useBoardViews: () => ({ data: views }),
  useCreateView: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteView: () => ({ mutate: vi.fn() }),
  useUpdateView: () => ({ mutate: vi.fn() }),
}));

describe('ViewSelector', () => {
  it('renders the "No view" trigger, grouped entries and view names', async () => {
    const user = userEvent.setup();
    render(
      <ViewSelector
        views={views}
        activeViewId={null}
        onSelect={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: /saved views/i }));

    // "No view" matches both the trigger label and the menu item; the grouped
    // entry assertions target the menu content specifically.
    expect((await screen.findAllByText('No view')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Board views')).toBeInTheDocument();
    expect(screen.getByText('My views')).toBeInTheDocument();
    expect(screen.getByText('Team urgent')).toBeInTheDocument();
    expect(screen.getByText('Mine')).toBeInTheDocument();
  });

  it('calls onSelect with the view id when a view entry is clicked', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <ViewSelector
        views={views}
        activeViewId={null}
        onSelect={onSelect}
        onRename={() => {}}
        onDelete={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: /saved views/i }));
    await user.click(await screen.findByText('Team urgent'));

    expect(onSelect).toHaveBeenCalledWith('v1');
  });

  it('calls onSelect(null) when the "No view" entry is clicked', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <ViewSelector
        views={views}
        activeViewId="v2"
        onSelect={onSelect}
        onRename={() => {}}
        onDelete={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: /saved views/i }));
    const noViewEntries = await screen.findAllByText('No view');
    // The first match is the trigger text; the menu item is the second.
    await user.click(noViewEntries[noViewEntries.length - 1]);

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('shows the active view name in the trigger', () => {
    render(
      <ViewSelector
        views={views}
        activeViewId="v1"
        onSelect={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: /saved views/i })).toHaveTextContent('Team urgent');
  });
});
