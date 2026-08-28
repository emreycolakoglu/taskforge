import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Task } from '@/types';
import { TaskCard } from './task-card';

vi.mock('@/hooks/use-relations', () => ({
  useTaskRelations: () => ({
    data: { blockedBy: [], blocking: [], relatedTo: [] },
    isLoading: false,
    error: null,
  }),
}));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    statusId: 's1',
    boardId: 'b1',
    number: 1,
    taskNumber: 'TF-1',
    title: 'Test task',
    position: 0,
    priority: 'medium',
    doneAt: null,
    assigneeId: null,
    parentId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    _count: { comments: 0 },
    ...overrides,
  };
}

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('TaskCard', () => {
  it('shows a read-only estimate chip when an estimate is set', () => {
    renderWithClient(<TaskCard task={makeTask({ estimate: 3 })} />);
    expect(screen.getByLabelText('Estimation: 3')).toBeInTheDocument();
  });

  it('hides the estimate chip when none is set', () => {
    renderWithClient(<TaskCard task={makeTask({ estimate: null })} />);
    expect(screen.queryByLabelText(/Estimation/)).not.toBeInTheDocument();
  });

  it('shows a blocked pill when blockedByCount is positive', () => {
    renderWithClient(<TaskCard task={makeTask({ blockedByCount: 2 })} />);
    expect(screen.getByLabelText('Blocked by 2 task(s)')).toBeInTheDocument();
  });

  it('hides the blocked pill when blockedByCount is zero', () => {
    renderWithClient(<TaskCard task={makeTask({ blockedByCount: 0 })} />);
    expect(screen.queryByLabelText(/Blocked by/)).not.toBeInTheDocument();
  });

  it('shows a blocking pill when blockingCount is positive', () => {
    renderWithClient(<TaskCard task={makeTask({ blockingCount: 1 })} />);
    expect(screen.getByLabelText('Blocking 1 task(s)')).toBeInTheDocument();
  });

  it('hides the blocking pill when blockingCount is zero', () => {
    renderWithClient(<TaskCard task={makeTask({ blockingCount: 0 })} />);
    expect(screen.queryByLabelText(/Blocking/)).not.toBeInTheDocument();
  });
});
