import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DeleteBoardSection } from './board-settings-page';

let mockUser: { id: string } | null = { id: 'user-1' };

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock('@/hooks/use-members', () => ({
  useMembers: () => ({
    data: [
      { userId: 'user-1', role: 'admin' },
      { userId: 'user-2', role: 'member' },
    ],
  }),
}));

const mockDelete = vi.fn();
vi.mock('@/hooks/use-boards', () => ({
  useDeleteBoard: () => ({
    mutate: (...args: any[]) => mockDelete(...args),
    isPending: false,
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/board/b1/settings']}>
        <Routes>
          <Route
            path="/board/:id/settings"
            element={<DeleteBoardSection boardId="b1" boardName="TFG Board" />}
          />
          <Route path="/boards" element={<div>BOARDS PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DeleteBoardSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'user-1' };
    mockDelete.mockReset();
  });

  it('shows the danger zone for an admin member', () => {
    renderSection();
    expect(screen.getByText('Danger Zone')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete board/i })).toBeInTheDocument();
  });

  it('hides the danger zone for a non-admin member', () => {
    mockUser = { id: 'user-2' }; // member, not admin
    renderSection();
    expect(screen.queryByText('Danger Zone')).not.toBeInTheDocument();
  });

  it('opens a confirm dialog and deletes the board on confirm', async () => {
    mockDelete.mockImplementation((_id, opts) => opts?.onSuccess?.());
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole('button', { name: /delete board/i }));
    expect(screen.getByText(/Are you sure you want to delete/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(mockDelete).toHaveBeenCalledWith('b1', expect.any(Object));
    await waitFor(() => expect(screen.getByText('BOARDS PAGE')).toBeInTheDocument());
  });

  it('does not delete when the user cancels', async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole('button', { name: /delete board/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mockDelete).not.toHaveBeenCalled();
    expect(screen.queryByText(/Are you sure you want to delete/i)).not.toBeInTheDocument();
  });
});
