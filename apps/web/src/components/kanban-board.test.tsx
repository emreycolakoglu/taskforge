import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SidebarProvider } from '@/components/ui/sidebar';
import { KanbanBoard } from './kanban-board';
import type { Board, Member, Task, User, View } from '@/types';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    statusId: 's1',
    boardId: 'b1',
    number: 1,
    taskNumber: 'TF-1',
    title: 'Urgent task',
    position: 0,
    priority: 'urgent',
    doneAt: null,
    assigneeId: null,
    parentId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    _count: { comments: 0 },
    ...overrides,
  };
}

const urgentTask = makeTask({ id: 't1', title: 'Urgent task', priority: 'urgent', position: 0 });
const lowTask = makeTask({ id: 't2', title: 'Low task', priority: 'low', position: 1 });

const mockBoard: Board = {
  id: 'b1',
  name: 'Sprint 1',
  slug: 'sprint-1',
  identifier: 'TF',
  createdAt: '2026-01-01',
  statuses: [
    {
      id: 's1',
      boardId: 'b1',
      name: 'Todo',
      type: 'todo',
      position: 0,
      tasks: [urgentTask, lowTask],
    },
  ],
  labels: [],
};

const meUser: User = {
  id: 'u-me',
  email: 'me@example.com',
  displayName: 'Me',
  role: 'member',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function makeMember(overrides: Partial<Member> = {}): Member {
  return { id: 'm1', boardId: 'b1', userId: 'u-other', role: 'member', ...overrides };
}

const mockView: View = {
  id: 'v1',
  boardId: 'b1',
  userId: 'u1',
  isShared: true,
  name: 'Urgent only',
  filters: { priorities: ['urgent'] },
  groupBy: 'status',
  sortBy: 'position',
  layout: 'board',
  position: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const useBoardViewsMock = vi.fn(() => ({ data: [mockView], isLoading: false }));

const authUserOverride = { current: meUser };
const boardOverride = { current: mockBoard };

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: authUserOverride.current }),
}));

vi.mock('@/hooks/use-boards', () => ({
  useBoardFull: () => ({ data: boardOverride.current }),
}));

vi.mock('@/hooks/use-tasks', () => ({
  useCreateTask: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/hooks/use-users', () => ({
  useUsers: () => ({ data: [] }),
}));

vi.mock('@/hooks/use-socket', () => ({
  useSocket: vi.fn(),
}));

vi.mock('@/hooks/use-views', () => ({
  useBoardViews: () => useBoardViewsMock(),
  useCreateView: () => ({ mutate: vi.fn() }),
  useUpdateView: () => ({ mutate: vi.fn() }),
  useDeleteView: () => ({ mutate: vi.fn() }),
}));

vi.mock('@hello-pangea/dnd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hello-pangea/dnd')>();
  return {
    ...actual,
    DragDropContext: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Droppable: ({
      children,
    }: {
      children: (provided: unknown, snapshot: { isDraggingOver: boolean }) => React.ReactNode;
    }) => <>{children({}, { isDraggingOver: false })}</>,
    Draggable: ({
      children,
    }: {
      children: (provided: unknown, snapshot: { isDragging: boolean }) => React.ReactNode;
    }) => <>{children({}, { isDragging: false })}</>,
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderBoard(route: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <SidebarProvider>
          <Routes>
            <Route path="/board/:id" element={<KanbanBoard />} />
          </Routes>
        </SidebarProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  authUserOverride.current = meUser;
  boardOverride.current = mockBoard;
  useBoardViewsMock.mockReturnValue({ data: [mockView], isLoading: false });
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('KanbanBoard — saved views', () => {
  it('filters tasks by the active view (?view=v1 with priority filter)', async () => {
    renderBoard('/board/b1?view=v1');

    await waitFor(() => {
      expect(screen.getByText('Urgent task')).toBeInTheDocument();
    });
    // The view filters by priority=urgent; the low-priority task is hidden.
    expect(screen.queryByText('Low task')).not.toBeInTheDocument();
  });

  it('renders all tasks when no view param is present', () => {
    renderBoard('/board/b1');

    expect(screen.getByText('Urgent task')).toBeInTheDocument();
    expect(screen.getByText('Low task')).toBeInTheDocument();
  });

  it('falls back to default rendering when the ?view= param is stale', async () => {
    renderBoard('/board/b1?view=missing');

    // The stale param is stripped by useActiveView; with no active view the
    // board shows everything.
    await waitFor(() => {
      expect(screen.getByText('Urgent task')).toBeInTheDocument();
    });
    expect(screen.getByText('Low task')).toBeInTheDocument();
  });

  it('renders grouped columns instead of status columns when the view groups by non-status', () => {
    const view: View = { ...mockView, id: 'v2', filters: {}, groupBy: 'none' };
    useBoardViewsMock.mockReturnValue({ data: [view], isLoading: false });
    renderBoard('/board/b1?view=v2');

    // groupBy 'none' produces a single "All tasks" column rather than status columns.
    expect(screen.getByText('All tasks')).toBeInTheDocument();
    expect(screen.getByText('Urgent task')).toBeInTheDocument();
    expect(screen.getByText('Low task')).toBeInTheDocument();
    // The status column header is gone.
    expect(screen.queryByText('Todo')).not.toBeInTheDocument();
  });
});

describe('KanbanBoard — save-as-view trigger gating', () => {
  it('hides the Save trigger on a pristine board (no active view, no filters)', () => {
    renderBoard('/board/b1');

    expect(screen.getByText('Urgent task')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save as view/i })).not.toBeInTheDocument();
  });

  it('hides the Save trigger on a pristine active view (filters at default)', () => {
    const view: View = { ...mockView, id: 'v3', filters: {} };
    useBoardViewsMock.mockReturnValue({ data: [view], isLoading: false });
    renderBoard('/board/b1?view=v3');

    expect(screen.getByText('Urgent task')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save as view/i })).not.toBeInTheDocument();
  });

  it('shows the Save trigger when an active view applies a filter', async () => {
    useBoardViewsMock.mockReturnValue({ data: [mockView], isLoading: false });
    renderBoard('/board/b1?view=v1');

    // mockView filters by priority=urgent, so the low-priority task is hidden —
    // proof the view's effective state deviates from the default.
    await waitFor(() => {
      expect(screen.queryByText('Low task')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /save as view/i })).toBeInTheDocument();
  });
});

describe('KanbanBoard — shared-view availability (canShare)', () => {
  async function openSaveDialog() {
    // The Save trigger (and thus the dialog) is gated on filter deviation, so
    // seed a label filter in the board's persisted view state before mounting.
    localStorage.setItem(
      'taskforge:board-view:b1',
      JSON.stringify({
        viewMode: 'kanban',
        filters: {
          labelIds: ['l1'],
          assigneeIds: [],
          priorities: [],
          dueDateRange: { from: null, to: null },
          searchQuery: '',
        },
      }),
    );
    renderBoard('/board/b1');
    await screen.findByRole('button', { name: /save as view/i });
    fireEvent.click(screen.getByRole('button', { name: /save as view/i }));
  }

  it('offers the shared option when the current user has a Member row', async () => {
    boardOverride.current = {
      ...mockBoard,
      members: [makeMember({ userId: 'u-me' })],
    };
    await openSaveDialog();

    expect(screen.getByLabelText(/^shared/i)).toBeInTheDocument();
  });

  it('hides the shared option when the user has no Member row', async () => {
    boardOverride.current = {
      ...mockBoard,
      members: [makeMember({ userId: 'u-other' })],
    };
    await openSaveDialog();

    expect(screen.queryByLabelText(/^shared/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/personal/i)).toBeInTheDocument();
  });

  it('keeps the legacy-board fallback: zero Member rows allows sharing', async () => {
    boardOverride.current = { ...mockBoard, members: [] };
    await openSaveDialog();

    expect(screen.getByLabelText(/^shared/i)).toBeInTheDocument();
  });
});
