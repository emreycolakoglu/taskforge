import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { StatusesSection } from './statuses-section';
import type { Status } from '@/types';

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockReorder = vi.fn();

vi.mock('@/hooks/api', () => ({
  api: {
    statuses: {
      create: (...args: any[]) => mockCreate(...args),
      update: (...args: any[]) => mockUpdate(...args),
      delete: (...args: any[]) => mockDelete(...args),
      reorder: (...args: any[]) => mockReorder(...args),
      list: vi.fn(),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const statuses: Status[] = [
  {
    id: 's1',
    boardId: 'b1',
    name: 'Backlog',
    type: 'backlog',
    position: 0,
    progress: 0,
    _count: { tasks: 2 },
  },
  {
    id: 's2',
    boardId: 'b1',
    name: 'Todo',
    type: 'todo',
    position: 1,
    progress: 0,
    _count: { tasks: 0 },
  },
  {
    id: 's3',
    boardId: 'b1',
    name: 'In Progress',
    type: 'in_progress',
    position: 2,
    progress: 50,
    _count: { tasks: 1 },
  },
  {
    id: 's4',
    boardId: 'b1',
    name: 'Done',
    type: 'done',
    position: 3,
    progress: 100,
    _count: { tasks: 5 },
  },
];

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <StatusesSection boardId="b1" statuses={statuses} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('StatusesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockReorder.mockReset();
  });

  it('renders all statuses with their names and type badges', () => {
    renderSection();
    // Each status name appears twice: once as the row name, once as the type badge label.
    expect(screen.getAllByText('Backlog')).toHaveLength(2);
    expect(screen.getAllByText('Todo')).toHaveLength(2);
    expect(screen.getAllByText('In Progress')).toHaveLength(2);
    expect(screen.getAllByText('Done')).toHaveLength(2);
  });

  it('shows task counts per status', () => {
    renderSection();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('opens add form on "Add Status" click', async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(screen.getByText(/add status/i));
    expect(screen.getByPlaceholderText('Status name...')).toBeInTheDocument();
  });

  it('creates a status with name, type, and color', async () => {
    mockCreate.mockResolvedValueOnce({ id: 's5', name: 'Triage', type: 'triage' });
    const user = userEvent.setup();
    renderSection();
    await user.click(screen.getByText(/add status/i));
    await user.type(screen.getByPlaceholderText('Status name...'), 'Triage');
    await user.click(screen.getByText('Add'));
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ boardId: 'b1', name: 'Triage', type: 'todo' }),
      );
    });
  });

  it('opens edit form on "Edit" click and saves changes', async () => {
    mockUpdate.mockResolvedValueOnce({ id: 's1', name: 'Icebox', type: 'backlog' });
    const user = userEvent.setup();
    renderSection();
    const editButtons = screen.getAllByText('Edit');
    await user.click(editButtons[0]);
    const nameInput = screen.getByDisplayValue('Backlog');
    await user.clear(nameInput);
    await user.type(nameInput, 'Icebox');
    await user.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('s1', expect.objectContaining({ name: 'Icebox' }));
    });
  });

  it('deletes a status after confirming in the dialog', async () => {
    mockDelete.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderSection();
    const deleteButtons = screen.getAllByLabelText('Delete status');
    await user.click(deleteButtons[0]);
    expect(screen.getByText('Delete status')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('s1');
    });
  });

  it('does not delete a status when cancel is clicked', async () => {
    const user = userEvent.setup();
    renderSection();
    const deleteButtons = screen.getAllByLabelText('Delete status');
    await user.click(deleteButtons[0]);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('reorders up on arrow up click', async () => {
    mockReorder.mockResolvedValueOnce([]);
    const user = userEvent.setup();
    renderSection();
    const upButtons = screen.getAllByLabelText('Move up');
    await user.click(upButtons[1]);
    await waitFor(() => {
      expect(mockReorder).toHaveBeenCalled();
    });
  });

  it('hides progress input for locked types (backlog)', async () => {
    const user = userEvent.setup();
    renderSection();
    const editButtons = screen.getAllByText('Edit');
    await user.click(editButtons[0]);
    expect(screen.queryByText('Progress')).not.toBeInTheDocument();
  });

  it('shows progress input for editable types (in_progress)', async () => {
    const user = userEvent.setup();
    renderSection();
    const editButtons = screen.getAllByText('Edit');
    await user.click(editButtons[2]);
    expect(screen.getByText('Progress')).toBeInTheDocument();
  });
});
