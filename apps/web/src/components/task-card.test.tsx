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

  it('shows an attachment count when the task has attachments', () => {
    renderWithClient(
      <TaskCard
        task={makeTask({
          attachments: [
            {
              id: 'a1',
              subjectType: 'task',
              subjectId: 't1',
              filename: 'note.txt',
              mimeType: 'text/plain',
              sizeBytes: 1,
              uploaderId: null,
              uploader: null,
              createdAt: '2026-09-17T00:00:00Z',
            },
          ],
        })}
      />,
    );

    expect(screen.getByLabelText('1 attachment')).not.toHaveAttribute('style');
  });

  it('shows a muted project badge when the task carries a project (TFG-34)', () => {
    renderWithClient(
      <TaskCard task={makeTask({ project: { id: 'p1', name: 'Roadmap', icon: '📦' } })} />,
    );

    const badge = screen.getByLabelText('Project: Roadmap');
    expect(badge).toHaveTextContent('📦');
    expect(badge).toHaveTextContent('Roadmap');
  });

  it('hides the project badge when the task has none', () => {
    renderWithClient(<TaskCard task={makeTask({ project: null })} />);

    expect(screen.queryByLabelText(/Project:/)).not.toBeInTheDocument();
  });

  // Browser feedback: the badge row overflowed the card when its chips didn't
  // fit. It must wrap, and long project/label names must truncate.
  describe('badge row wrapping', () => {
    const longTask = () =>
      makeTask({
        estimate: 5,
        blockedByCount: 1,
        project: { id: 'p1', name: 'A very long project name that cannot fit', icon: '📦' },
        labels: [
          {
            taskId: 't1',
            labelId: 'l1',
            assignedAt: '2026-01-01T00:00:00Z',
            label: {
              id: 'l1',
              boardId: 'b1',
              name: 'An extremely long label name',
              color: '#f00',
              createdAt: '2026-01-01T00:00:00Z',
              updatedAt: '2026-01-01T00:00:00Z',
            },
          },
        ],
      });

    it('wraps the badge row and its chip group', () => {
      renderWithClient(<TaskCard task={longTask()} />);
      const row = screen.getByTestId('task-card-badges');
      expect(row.className).toMatch(/\bflex-wrap\b/);
      expect(row.className).toMatch(/\bmin-w-0\b/);
      const group = screen.getByLabelText(/^Project:/).parentElement!;
      expect(group.className).toMatch(/\bflex-wrap\b/);
      expect(group.className).toMatch(/\bmin-w-0\b/);
      expect(group.className).not.toMatch(/\bshrink-0\b/);
    });

    it('truncates long project and label chips', () => {
      renderWithClient(<TaskCard task={longTask()} />);
      const projectName = screen.getByText('A very long project name that cannot fit');
      expect(projectName.className).toMatch(/\btruncate\b/);
      expect(screen.getByLabelText(/^Project:/).className).toMatch(/\bmin-w-0\b/);
      const labelName = screen.getByText('An extremely long label name');
      expect(labelName.className).toMatch(/\btruncate\b/);
    });
  });
});
