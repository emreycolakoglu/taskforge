/**
 * ProjectKanbanBoard tests (Projects v2 §4).
 *
 * @hello-pangea/dnd is replaced with pass-through components that record
 * their props, so the tests drive onDragStart/onDragEnd directly and assert
 * each Droppable's drop gating instead of simulating a real pointer drag.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DragStart, DropResult } from '@hello-pangea/dnd';
import { toast } from 'sonner';
import { api } from '@/hooks/api';
import type { Board, ProjectDetail, Status, Task } from '@/types';
import { ProjectKanbanBoard } from './project-kanban-board';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/hooks/api', () => ({
  api: { tasks: { move: vi.fn(), reorder: vi.fn() } },
}));

const boardsFull = vi.hoisted(() => ({ current: [] as Board[] }));
vi.mock('@/hooks/use-boards', () => ({
  useBoardsFull: () => boardsFull.current,
}));

const dnd = vi.hoisted(() => ({
  context: null as null | {
    onDragStart?: (start: DragStart) => void;
    onDragEnd: (result: DropResult) => void;
  },
  droppables: new Map<string, { type?: string; isDropDisabled?: boolean }>(),
}));

vi.mock('@hello-pangea/dnd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hello-pangea/dnd')>();
  return {
    ...actual,
    DragDropContext: (props: {
      children?: React.ReactNode;
      onDragStart?: (start: DragStart) => void;
      onDragEnd: (result: DropResult) => void;
    }) => {
      dnd.context = props;
      return <>{props.children}</>;
    },
    Droppable: ({
      children,
      droppableId,
      type,
      isDropDisabled,
    }: {
      droppableId: string;
      type?: string;
      isDropDisabled?: boolean;
      children: (provided: unknown, snapshot: { isDraggingOver: boolean }) => React.ReactNode;
    }) => {
      dnd.droppables.set(droppableId, { type, isDropDisabled });
      return <>{children({}, { isDraggingOver: false })}</>;
    },
    Draggable: ({
      children,
    }: {
      children: (provided: unknown, snapshot: { isDragging: boolean }) => React.ReactNode;
    }) => <>{children({ draggableProps: {} }, { isDragging: false })}</>,
  };
});

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeStatus(overrides: Partial<Status>): Status {
  return { id: 's', boardId: 'b1', name: 'Todo', type: 'todo', position: 0, ...overrides };
}

const project = { id: 'p1', name: 'Roadmap', icon: '📦' };

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: 't',
    statusId: 's',
    boardId: 'b1',
    number: 1,
    taskNumber: 'TFG-0',
    title: 'Task',
    position: 0,
    priority: 'medium',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    projectId: 'p1',
    project,
    ...overrides,
  };
}

const b1Todo = makeStatus({ id: 'b1-todo', name: 'Todo', color: '#62666d', position: 0 });
const b1Ip = makeStatus({ id: 'b1-ip', name: 'In Progress', type: 'in_progress', position: 1 });
const b1Done = makeStatus({ id: 'b1-done', name: 'Done', type: 'done', position: 2 });
const b2Ip = makeStatus({ id: 'b2-ip', boardId: 'b2', name: 'In Progress', position: 0 });

const t1 = makeTask({
  id: 't1',
  statusId: 'b1-todo',
  status: b1Todo,
  taskNumber: 'TFG-1',
  title: 'Fix login loop',
});
// A board task that is NOT in the project — planning must keep its slot.
const outsider = makeTask({
  id: 'tx',
  statusId: 'b1-ip',
  position: 0,
  projectId: null,
  project: null,
});
const t3 = makeTask({
  id: 't3',
  statusId: 'b1-ip',
  status: b1Ip,
  position: 1,
  taskNumber: 'TFG-3',
  title: 'Polish empty states',
});
const t2 = makeTask({
  id: 't2',
  boardId: 'b2',
  statusId: 'b2-ip',
  status: b2Ip,
  taskNumber: 'INF-2',
  title: 'Ship settings import',
});

const tfg: Board = {
  id: 'b1',
  name: 'Sprint',
  slug: 'sprint',
  identifier: 'TFG',
  createdAt: '2026-01-01',
  statuses: [
    { ...b1Todo, tasks: [t1] },
    { ...b1Ip, tasks: [outsider, t3] },
    { ...b1Done, tasks: [] },
  ],
};
const inf: Board = {
  id: 'b2',
  name: 'Infra',
  slug: 'infra',
  identifier: 'INF',
  createdAt: '2026-01-01',
  statuses: [{ ...b2Ip, tasks: [t2] }],
};

const tasks = [t1, t3, t2];

function TaskRouteProbe() {
  const { boardId, taskId } = useParams();
  return <p>{`task ${boardId}/${taskId}`}</p>;
}

function renderBoard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData<ProjectDetail>(['projects', 'p1'], {
    ...project,
    leadId: null,
    status: 'started',
    position: 0,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    tasks,
  } as ProjectDetail);
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/projects/p1']}>
        <Routes>
          <Route
            path="/projects/:projectId"
            element={<ProjectKanbanBoard projectId="p1" tasks={tasks} />}
          />
          <Route path="/board/:boardId/task/:taskId" element={<TaskRouteProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return queryClient;
}

function column(statusId: string) {
  return screen.getByTestId(`project-column-${statusId}`);
}

function drop(draggableId: string, from: string, fromIndex: number, to: string, toIndex: number) {
  return dnd.context!.onDragEnd({
    draggableId,
    type: 'DEFAULT',
    reason: 'DROP',
    mode: 'FLUID',
    source: { droppableId: from, index: fromIndex },
    destination: { droppableId: to, index: toIndex },
    combine: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  dnd.context = null;
  dnd.droppables.clear();
  boardsFull.current = [tfg, inf];
  vi.mocked(api.tasks.move).mockResolvedValue(t1);
  vi.mocked(api.tasks.reorder).mockResolvedValue([]);
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ProjectKanbanBoard — stale board cache', () => {
  it('refreshes the board and tells the user instead of silently snapping back', async () => {
    // Someone else moved t1; the cached board no longer holds it anywhere.
    boardsFull.current = [
      {
        ...tfg,
        statuses: tfg.statuses!.map((s) => ({
          ...s,
          tasks: s.tasks!.filter((t) => t.id !== 't1'),
        })),
      },
      inf,
    ];
    const queryClient = renderBoard();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await act(() => drop('t1', 'b1-todo', 0, 'b1-done', 0));

    expect(api.tasks.move).not.toHaveBeenCalled();
    expect(api.tasks.reorder).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['boards', 'b1', 'full'] });
    expect(toast.error).toHaveBeenCalledWith('Board changed — try again');
  });
});

describe('ProjectKanbanBoard — columns', () => {
  it("renders every status of the represented boards, including the board's empty ones", () => {
    renderBoard();

    expect(within(column('b1-done')).getByText('Done')).toBeInTheDocument();
    expect(within(column('b1-done')).getByText('No issues')).toBeInTheDocument();
  });

  it('distinguishes same-named statuses with a board identifier chip', () => {
    renderBoard();

    expect(within(column('b1-ip')).getByText('In Progress')).toBeInTheDocument();
    expect(within(column('b1-ip')).getByText('TFG')).toBeInTheDocument();
    expect(within(column('b2-ip')).getByText('In Progress')).toBeInTheDocument();
    expect(within(column('b2-ip')).getByText('INF')).toBeInTheDocument();
  });

  it('counts only the project tasks in each column', () => {
    renderBoard();

    // b1-ip also holds a non-project task on the board; it is not shown.
    expect(within(column('b1-ip')).getByTestId('column-count')).toHaveTextContent('1');
    expect(within(column('b1-done')).getByTestId('column-count')).toHaveTextContent('0');
    expect(within(column('b1-ip')).getByText('Polish empty states')).toBeInTheDocument();
  });

  it('colors the header dot with the status color', () => {
    renderBoard();

    expect(within(column('b1-todo')).getByTestId('status-dot')).toHaveStyle({
      backgroundColor: '#62666d',
    });
  });

  it('hides the redundant project chip on cards', () => {
    renderBoard();

    expect(screen.queryByLabelText('Project: Roadmap')).not.toBeInTheDocument();
  });

  it("navigates to the card's own board-scoped task route on click", async () => {
    renderBoard();

    await userEvent.click(screen.getByText('Ship settings import'));
    expect(screen.getByText('task b2/t2')).toBeInTheDocument();
  });
});

describe('ProjectKanbanBoard — drag and drop', () => {
  it("types each column with its board so cards only drop on their own board's columns", () => {
    renderBoard();

    expect(dnd.droppables.get('b1-ip')?.type).toBe('b1');
    expect(dnd.droppables.get('b2-ip')?.type).toBe('b2');
  });

  it("drop-disables other boards' columns while a card is dragged", () => {
    renderBoard();
    expect(dnd.droppables.get('b2-ip')?.isDropDisabled).toBe(false);

    act(() =>
      dnd.context!.onDragStart!({
        draggableId: 't1',
        type: 'b1',
        mode: 'FLUID',
        source: { droppableId: 'b1-todo', index: 0 },
      }),
    );

    expect(dnd.droppables.get('b2-ip')?.isDropDisabled).toBe(true);
    expect(dnd.droppables.get('b1-done')?.isDropDisabled).toBe(false);
    expect(column('b2-ip').className).toMatch(/\bopacity-/);
  });

  it("moves a card into its board's empty column via the move endpoint", async () => {
    const queryClient = renderBoard();

    await act(() => drop('t1', 'b1-todo', 0, 'b1-done', 0));

    expect(api.tasks.move).toHaveBeenCalledWith('t1', { statusId: 'b1-done', position: 0 });
    const cached = queryClient.getQueryData<ProjectDetail>(['projects', 'p1'])!;
    expect(cached.tasks!.find((t) => t.id === 't1')!.statusId).toBe('b1-done');
  });

  it('derives the position from the full board column, not just project tasks', async () => {
    renderBoard();

    // Dropping in front of t3 lands in front of t3's real slot (position 1),
    // behind the hidden non-project task at position 0.
    await act(() => drop('t1', 'b1-todo', 0, 'b1-ip', 0));

    expect(api.tasks.move).toHaveBeenCalledWith('t1', { statusId: 'b1-ip', position: 1 });
  });

  it('ignores a drop onto another board even if one slips through', async () => {
    renderBoard();

    await act(() => drop('t1', 'b1-todo', 0, 'b2-ip', 0));

    expect(api.tasks.move).not.toHaveBeenCalled();
  });

  it('rolls back the optimistic move and toasts when the API rejects it', async () => {
    vi.mocked(api.tasks.move).mockRejectedValue(new Error('Status belongs to a different board'));
    const queryClient = renderBoard();

    await act(() => drop('t1', 'b1-todo', 0, 'b1-done', 0));

    expect(toast.error).toHaveBeenCalledWith('Failed to move task', {
      description: 'Status belongs to a different board',
    });
    const cached = queryClient.getQueryData<ProjectDetail>(['projects', 'p1'])!;
    expect(cached.tasks!.find((t) => t.id === 't1')!.statusId).toBe('b1-todo');
  });
});
