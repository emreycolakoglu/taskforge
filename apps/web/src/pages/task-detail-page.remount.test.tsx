import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TaskDetailPage } from './task-detail-page';
import { SidebarProvider } from '@/components/ui/sidebar';

const mockTask = {
  id: 'task-1',
  statusId: 'status-1',
  boardId: 'board-1',
  number: 1,
  taskNumber: 'TF-1',
  title: 'Fix login bug',
  description: 'Login page is broken',
  position: 0,
  priority: 'high' as const,
  assigneeId: 'user-1',
  dueDate: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
};

const mockBoard = {
  id: 'board-1',
  name: 'Sprint 1',
  slug: 'sprint-1',
  identifier: 'TF',
  createdAt: '2026-01-01',
  statuses: [
    {
      id: 'status-1',
      boardId: 'board-1',
      name: 'Backlog',
      type: 'backlog',
      position: 0,
      tasks: [mockTask],
    },
  ],
  labels: [],
};

vi.mock('@/components/task-detail-view', () => ({
  // Probe: tags each render with the task id so the DOM identity per task is
  // observable — React Router reuses the element in-place on param change,
  // so only a keyed remount replaces the node.
  TaskDetailView: vi.fn(({ taskId }: { taskId: string }) => (
    <div data-testid="view-probe" data-task-id={taskId} />
  )),
}));

vi.mock('@/hooks/use-tasks', () => ({
  useTask: ({ id }: { id: string }) => ({
    data: { ...mockTask, id },
    isLoading: false,
    error: null,
  }),
  useUpdateTask: () => ({ mutate: vi.fn() }),
  useTasksByBoard: () => ({ data: [mockTask] }),
  useCreateTask: () => ({ mutate: vi.fn() }),
  useSetTaskPublic: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/hooks/use-boards', () => ({
  useBoardFull: () => ({ data: mockBoard }),
}));

vi.mock('@/hooks/use-users', () => ({
  useUsers: () => ({ data: [] }),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { id: 'user-1', role: 'admin' } }),
}));

/**
 * TFG-45 regression guard: switching to another task must remount the detail
 * body, so no description-editor/autosave state survives across tasks. The
 * probe's DOM node identity proves remount vs. in-place reuse.
 */
describe('TaskDetailPage cross-task remount', () => {
  it('remounts the detail body when the taskId route param changes', async () => {
    function AutoNavigate() {
      const navigate = useNavigate();
      useEffect(() => {
        const t = setTimeout(() => navigate('/board/board-1/task/task-2'), 0);
        return () => clearTimeout(t);
      }, [navigate]);
      return null;
    }

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/board/board-1/task/task-1']}>
          <AutoNavigate />
          <Routes>
            <Route
              path="/board/:boardId/task/:taskId"
              element={
                <SidebarProvider>
                  <TaskDetailPage />
                </SidebarProvider>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const firstProbe = screen.getByTestId('view-probe');
    expect(firstProbe.getAttribute('data-task-id')).toBe('task-1');

    await waitFor(() => {
      expect(screen.getByTestId('view-probe').getAttribute('data-task-id')).toBe('task-2');
    });

    // Remount = the DOM node was replaced, not mutated in place.
    const secondProbe = screen.getByTestId('view-probe');
    expect(secondProbe).not.toBe(firstProbe);
  });
});
