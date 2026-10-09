/**
 * ProjectDetailPage tests (TFG-34, Task 6).
 *
 * Mirrors pages/projects-page.test.tsx mocking style: vi.mock the hook
 * modules (every hook the page imports from a mocked module is in the
 * factory) and keep a mutable `data` fixture so each test can swap the
 * GET /api/projects/:id payload before rendering. The payload is the full
 * rollup shape from the API: project fields + hydrated tasks
 * (status/assignee/labels/project) + the progress summary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SidebarProvider } from '@/components/ui/sidebar';
import { ProjectDetailPage } from './project-detail-page';
import type { ProjectDetail } from '@/types';

// The create-task dialog is a tested component; the page test only pins the
// wiring — open via the "Add task" button, preset to this project.
const mockCreateTaskDialog = vi.hoisted(() => vi.fn());
const createTaskMutate = vi.hoisted(() => vi.fn());

vi.mock('@/components/create-task-dialog', () => ({
  CreateTaskDialog: (props: unknown) => {
    mockCreateTaskDialog(props);
    return null;
  },
}));

// The edit dialog is tested on its own; the page pins the entry point and
// the post-delete navigation.
const mockEditProjectDialog = vi.hoisted(() => vi.fn());
vi.mock('@/components/edit-project-dialog', () => ({
  EditProjectDialog: (props: unknown) => {
    mockEditProjectDialog(props);
    return null;
  },
}));

// The kanban board is tested on its own (project-kanban-board.test.tsx); the
// page pins the toggle and what it hands the board.
const mockProjectKanbanBoard = vi.hoisted(() => vi.fn());
vi.mock('@/components/project-kanban-board', () => ({
  ProjectKanbanBoard: (props: unknown) => {
    mockProjectKanbanBoard(props);
    return <div data-testid="project-kanban" />;
  },
}));

// The view choice persists in localStorage — keep tests independent.
beforeEach(() => localStorage.clear());

function editDialogProps() {
  return mockEditProjectDialog.mock.calls.at(-1)?.[0] as {
    open: boolean;
    project: { id: string };
    onOpenChange: (open: boolean) => void;
    onDeleted?: () => void;
  };
}

// Latest dialog props, as captured from the last render.
function dialogProps() {
  return mockCreateTaskDialog.mock.calls.at(-1)?.[0] as {
    open: boolean;
    projectId?: string;
    statuses?: { id: string }[];
    boards?: { id: string }[];
    boardId?: string;
    onBoardChange?: (id: string) => void;
    onSubmit: (data: { title: string; projectId: string | null }) => void;
  };
}

const mockProject: ProjectDetail = {
  id: 'p1',
  name: 'Roadmap',
  description: 'Q3 planning',
  icon: '📦',
  leadId: 'u1',
  status: 'started',
  completedAt: null,
  startDate: '2026-07-01',
  targetDate: '2026-09-30',
  position: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  // Payload order = status.position then position; the page groups in
  // first-appearance order, so groups must land Todo → In Progress → Done.
  tasks: [
    {
      id: 't1',
      statusId: 's1',
      boardId: 'b1',
      number: 101,
      taskNumber: 'TF-101',
      title: 'Fix login loop',
      position: 0,
      priority: 'high',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
      projectId: 'p1',
      project: { id: 'p1', name: 'Roadmap', icon: '📦' },
      status: {
        id: 's1',
        boardId: 'b1',
        name: 'Todo',
        type: 'todo',
        color: '#62666d',
        position: 0,
      },
      labels: [
        {
          taskId: 't1',
          labelId: 'l1',
          assignedAt: '2026-01-01',
          label: {
            id: 'l1',
            boardId: 'b1',
            name: 'Bug',
            color: '#eb5757',
            createdAt: '2026-01-01',
            updatedAt: '2026-01-01',
          },
        },
      ],
    },
    {
      id: 't2',
      statusId: 's2',
      boardId: 'b1',
      number: 102,
      taskNumber: 'TF-102',
      title: 'Wire offline-safe export',
      position: 0,
      priority: 'medium',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
      projectId: 'p1',
      project: { id: 'p1', name: 'Roadmap', icon: '📦' },
      status: {
        id: 's2',
        boardId: 'b1',
        name: 'In Progress',
        type: 'in_progress',
        color: '#eb5757',
        position: 1,
      },
      assignee: {
        id: 'u2',
        email: 'bob@example.com',
        displayName: 'Bob',
        role: 'member',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    },
    {
      id: 't3',
      statusId: 's2',
      boardId: 'b1',
      number: 103,
      taskNumber: 'TF-103',
      title: 'Polish board empty states',
      position: 1,
      priority: 'low',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
      projectId: 'p1',
      project: { id: 'p1', name: 'Roadmap', icon: '📦' },
      status: {
        id: 's2',
        boardId: 'b1',
        name: 'In Progress',
        type: 'in_progress',
        color: '#eb5757',
        position: 1,
      },
    },
    {
      id: 't4',
      statusId: 's3',
      boardId: 'b2',
      number: 104,
      taskNumber: 'TF-104',
      title: 'Ship settings import',
      position: 0,
      priority: 'urgent',
      doneAt: '2026-01-03T00:00:00Z',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-03T00:00:00Z',
      projectId: 'p1',
      project: { id: 'p1', name: 'Roadmap', icon: '📦' },
      status: {
        id: 's3',
        boardId: 'b1',
        name: 'Done',
        type: 'done',
        color: '#27a644',
        position: 2,
      },
    },
  ],
  progress: { total: 4, completed: 1, byStatus: { todo: 1, in_progress: 2, done: 1 } },
};

// Mutable so each test can swap fixture data before rendering.
const data: { project: ProjectDetail | null; loading: boolean } = {
  project: mockProject,
  loading: false,
};

vi.mock('@/hooks/use-projects', () => ({
  useProject: () => ({ data: data.project, isLoading: data.loading }),
}));
vi.mock('@/hooks/use-tasks', () => ({
  useCreateTask: () => ({ mutate: createTaskMutate, isPending: false }),
}));
// Statuses per board — the page feeds the dialog the SELECTED board's
// statuses via useBoardFull(selectedBoardId).
const statusesByBoard: Record<string, { id: string; boardId: string; name: string }[]> = {
  b1: [{ id: 's1', boardId: 'b1', name: 'Todo' }],
  b2: [{ id: 's9', boardId: 'b2', name: 'Backlog' }],
};
const mockUseBoardFull = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-boards', () => ({
  useBoards: () => ({
    data: [
      { id: 'b2', name: 'Infra', identifier: 'INF', icon: null },
      { id: 'b1', name: 'Sprint 1', identifier: 'TF', icon: '⭐' },
    ],
  }),
  useBoardFull: (id: string) => {
    mockUseBoardFull(id);
    return { data: id ? { id, statuses: statusesByBoard[id] ?? [] } : undefined };
  },
}));
vi.mock('@/hooks/use-users', () => ({
  useUserDirectory: () => ({ data: [{ id: 'u1', displayName: 'Alice' }] }),
}));
vi.mock('@/hooks/use-socket', () => ({
  useSocket: () => ({ on: vi.fn() }),
}));

function TaskRouteProbe() {
  const { boardId, taskId } = useParams();
  return <p>{`task ${boardId}/${taskId}`}</p>;
}

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <MemoryRouter initialEntries={['/projects/p1']}>
          {/* Global route (Projects v2) — no board in the URL. */}
          <Routes>
            <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
            <Route path="/projects" element={<p>projects list</p>} />
            <Route path="/board/:boardId/task/:taskId" element={<TaskRouteProbe />} />
          </Routes>
        </MemoryRouter>
      </SidebarProvider>
    </QueryClientProvider>,
  );
}

const formatDate = (ts: string) =>
  new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

describe('ProjectDetailPage', () => {
  it('renders the header fields from the payload', () => {
    renderPage();

    // Name appears in both the h1 and the breadcrumb's current page crumb.
    expect(screen.getAllByText('Roadmap').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('📦')).toBeInTheDocument();
    expect(screen.getByText('Started')).toBeInTheDocument();
    // leadId resolves through the user directory (the payload has only the id).
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Q3 planning')).toBeInTheDocument();
    expect(screen.getByText(formatDate('2026-07-01'))).toBeInTheDocument();
    expect(screen.getByText(formatDate('2026-09-30'))).toBeInTheDocument();
  });

  it('groups tasks by status in status order with counts', () => {
    renderPage();

    const todo = screen.getByText('Todo');
    const inProgress = screen.getByText('In Progress');
    const done = screen.getByText('Done');

    // Groups follow the payload's status order (status.position).
    expect(
      todo.compareDocumentPosition(inProgress) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      inProgress.compareDocumentPosition(done) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Count badge inside the group heading.
    const todoHeading = todo.closest('h2')!;
    const inProgressHeading = inProgress.closest('h2')!;
    expect(within(todoHeading).getByText('1')).toBeInTheDocument();
    expect(within(inProgressHeading).getByText('2')).toBeInTheDocument();

    // Group dot takes the status color.
    expect(inProgressHeading.querySelector('span')).toHaveStyle({
      backgroundColor: '#eb5757',
    });

    // Rows stay inside their own group.
    const todoSection = todo.closest('section')!;
    expect(within(todoSection).getByText('Fix login loop')).toBeInTheDocument();
    expect(within(todoSection).queryByText('Ship settings import')).toBeNull();
    const inProgressSection = inProgress.closest('section')!;
    expect(within(inProgressSection).getByText('Wire offline-safe export')).toBeInTheDocument();
    expect(within(inProgressSection).getByText('Polish board empty states')).toBeInTheDocument();
    expect(within(inProgressSection).queryByText('Fix login loop')).toBeNull();
    const doneSection = done.closest('section')!;
    expect(within(doneSection).getByText('Ship settings import')).toBeInTheDocument();
  });

  it('renders task rows with their hydration: number, label and assignee', () => {
    renderPage();

    const row = screen.getByText('Wire offline-safe export').closest('button')!;
    expect(within(row).getByText('TF-102')).toBeInTheDocument();
    expect(within(row).getByTitle('Bob')).toBeInTheDocument(); // avatar fallback

    const labeledRow = screen.getByText('Fix login loop').closest('button')!;
    expect(within(labeledRow).getByText('Bug')).toBeInTheDocument();
  });

  it('renders the server progress rollup as a neutral bar and count', () => {
    renderPage();

    const bar = screen.getByRole('progressbar', { name: 'Roadmap progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '25');
    expect(screen.getByText('1/4')).toBeInTheDocument();
  });

  it('renders nothing for the lead when the payload has none', () => {
    data.project = { ...mockProject, leadId: null };
    renderPage();
    expect(screen.getByText('Started')).toBeInTheDocument(); // page still renders
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    data.project = mockProject;
  });

  it('shows the not-found state for a missing project', () => {
    data.project = null;
    renderPage();
    expect(screen.getByText('Project not found.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to projects/i })).toBeInTheDocument();
    data.project = mockProject;
  });

  it('shows skeletons while loading', () => {
    data.loading = true;
    const { container } = renderPage();
    expect(screen.queryByText('Roadmap')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    data.loading = false;
  });

  it('shows an empty state when the project has no tasks', () => {
    data.project = {
      ...mockProject,
      tasks: [],
      progress: { total: 0, completed: 0, byStatus: {} },
    };
    renderPage();
    expect(screen.getByText('No tasks yet')).toBeInTheDocument();
    data.project = mockProject;
  });
});

describe('ProjectDetailPage — Add task to project (TFG-34)', () => {
  it('opens the create-task dialog preset to this project', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /add task/i }));

    const props = mockCreateTaskDialog.mock.calls.at(-1)?.[0] as {
      open: boolean;
      projectId?: string;
      statuses?: { id: string }[];
    };
    expect(props.open).toBe(true);
    expect(props.projectId).toBe('p1');
    // Tasks land in the board's first status — statuses passed through, no
    // separate default logic in the page.
    expect(props.statuses?.[0]?.id).toBe('s1');
  });

  it('does not render the dialog before the Add task button is used', () => {
    renderPage();

    const props = mockCreateTaskDialog.mock.calls.at(-1)?.[0] as { open?: boolean } | undefined;
    expect(props?.open ?? false).toBe(false);
  });

  it('creates the task linked to this project when the dialog submits with it', () => {
    renderPage();

    const { onSubmit } = dialogProps();
    onSubmit({ title: 'Fresh task', projectId: 'p1' });

    expect(createTaskMutate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Fresh task', projectId: 'p1', boardId: 'b1' }),
    );
  });

  it('respects an explicit No project pick over the route param', () => {
    renderPage();

    const { onSubmit } = dialogProps();
    onSubmit({ title: 'Fresh task', projectId: null });

    // The picker's explicit null wins — the route param is only a default.
    expect(createTaskMutate).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: null, boardId: 'b1' }),
    );
  });
});

describe('ProjectDetailPage — workspace-level project (Projects v2)', () => {
  it('links each task row to its OWN board-scoped task route', async () => {
    renderPage();

    await userEvent.click(screen.getByText('Ship settings import'));
    expect(screen.getByText('task b2/t4')).toBeInTheDocument();
  });

  it('navigates back to the global projects list', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('link', { name: 'Projects' }));
    expect(screen.getByText('projects list')).toBeInTheDocument();
  });

  it("defaults the dialog's board to the first task's board and passes the board list", () => {
    renderPage();

    const props = dialogProps();
    expect(props.boardId).toBe('b1');
    expect(props.boards?.map((b) => b.id)).toEqual(['b2', 'b1']);
    expect(mockUseBoardFull).toHaveBeenLastCalledWith('b1');
  });

  it('falls back to the first listed board when the project has no tasks', () => {
    data.project = {
      ...mockProject,
      tasks: [],
      progress: { total: 0, completed: 0, byStatus: {} },
    };
    renderPage();

    expect(dialogProps().boardId).toBe('b2');
    expect(dialogProps().statuses?.[0]?.id).toBe('s9');
    data.project = mockProject;
  });

  it('switches statuses and the create target when the dialog picks another board', () => {
    renderPage();

    act(() => dialogProps().onBoardChange!('b2'));

    expect(dialogProps().boardId).toBe('b2');
    expect(dialogProps().statuses?.[0]?.id).toBe('s9');
    dialogProps().onSubmit({ title: 'On infra', projectId: 'p1' });
    expect(createTaskMutate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'On infra', projectId: 'p1', boardId: 'b2' }),
    );
  });
});

describe('ProjectDetailPage — edit entry point (Projects v2)', () => {
  it('opens the edit dialog for this project from the header', async () => {
    renderPage();
    expect(editDialogProps().open).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Edit project' }));

    expect(editDialogProps().open).toBe(true);
    expect(editDialogProps().project.id).toBe('p1');
  });

  it('returns to the projects list after the project is deleted', () => {
    renderPage();

    act(() => editDialogProps().onDeleted!());

    expect(screen.getByText('projects list')).toBeInTheDocument();
  });

  it('wraps and truncates task-row labels instead of overflowing the row', () => {
    renderPage();

    const badge = screen.getByText('Bug').closest('div') as HTMLElement;
    expect(badge.className).toMatch(/\bmin-w-0\b/);
    expect(badge.parentElement!.className).toMatch(/\bflex-wrap\b/);
    expect(badge.parentElement!.className).toMatch(/\bmin-w-0\b/);
  });
});

describe('ProjectDetailPage — kanban view (Projects v2 §4)', () => {
  it('defaults to the grouped list', () => {
    renderPage();

    expect(screen.getByRole('radio', { name: 'List view' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText('Todo').closest('section')).toBeInTheDocument();
    expect(screen.queryByTestId('project-kanban')).not.toBeInTheDocument();
  });

  it('switches to the kanban board with the project tasks, keeping header and Add task', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('radio', { name: 'Kanban view' }));

    expect(screen.getByTestId('project-kanban')).toBeInTheDocument();
    const props = mockProjectKanbanBoard.mock.calls.at(-1)?.[0] as {
      projectId: string;
      tasks: { id: string }[];
    };
    expect(props.projectId).toBe('p1');
    expect(props.tasks.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4']);
    // Grouped sections are gone; the progress header and the CTA stay.
    expect(screen.queryByRole('region', { name: 'Todo tasks' })).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Roadmap progress' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add task/i })).toBeInTheDocument();
  });

  it('remembers the kanban choice for this project', async () => {
    const { unmount } = renderPage();
    await userEvent.click(screen.getByRole('radio', { name: 'Kanban view' }));
    unmount();

    renderPage();
    expect(screen.getByTestId('project-kanban')).toBeInTheDocument();
  });

  it('keeps the empty state instead of an empty board when there are no tasks', async () => {
    data.project = {
      ...mockProject,
      tasks: [],
      progress: { total: 0, completed: 0, byStatus: {} },
    };
    renderPage();
    await userEvent.click(screen.getByRole('radio', { name: 'Kanban view' }));

    expect(screen.getByText('No tasks yet')).toBeInTheDocument();
    expect(screen.queryByTestId('project-kanban')).not.toBeInTheDocument();
    data.project = mockProject;
  });
});
