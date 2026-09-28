/**
 * TFG-57 — task detail page mobile compatibility.
 *
 * Rules of hooks: useIsMobile() must be called unconditionally, before any
 * early return, or a cold navigation (query not cached) crashes with
 * "Rendered more hooks than during the previous render".
 *
 * Mobile layout: the properties sidebar renders inside a Sheet; the main
 * column paddings collapse on small viewports.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';

const mockUseIsMobile = vi.hoisted(() => vi.fn(() => false));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: mockUseIsMobile,
}));

vi.mock('@/hooks/use-socket', () => ({
  useSocket: () => ({ on: vi.fn() }),
}));

const mockUseTask = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-tasks', () => ({
  useTask: (id: string) => mockUseTask(id),
  useUpdateTask: () => ({ mutate: vi.fn() }),
  useTasksByBoard: () => ({ data: [] }),
  useCreateTask: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/hooks/use-relations', () => ({
  useTaskRelations: () => ({ data: undefined }),
  useCreateRelation: () => ({ mutate: vi.fn() }),
  useRemoveRelation: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/hooks/use-boards', () => ({
  useBoardFull: () => ({ data: undefined }),
}));

vi.mock('@/hooks/use-comments', () => ({
  useComments: () => ({ data: [] }),
  useCreateComment: () => ({ mutateAsync: vi.fn() }),
  useDeleteComment: () => ({ mutate: vi.fn() }),
  useUpdateComment: () => ({ mutateAsync: vi.fn() }),
  useReactToComment: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/hooks/use-attachments', () => ({
  useUploadAttachment: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/hooks/use-users', () => ({
  useUserDirectory: () => ({ data: [] }),
}));

vi.mock('@/hooks/use-labels', () => ({
  useLabels: () => ({ data: [] }),
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (
    <div data-testid="sheet" data-open={String(open)}>
      {children}
    </div>
  ),
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/detail-title-block', () => ({ DetailTitleBlock: () => null }));
vi.mock('@/components/detail-description-editor', () => ({ DetailDescriptionEditor: () => null }));
vi.mock('@/components/detail-sub-issues', () => ({ DetailSubIssues: () => null }));
vi.mock('@/components/detail-documents', () => ({ DetailDocuments: () => null }));
vi.mock('@/components/detail-activity', () => ({ DetailActivity: () => null }));
vi.mock('@/components/detail-comments', () => ({ DetailComments: () => null }));
vi.mock('@/components/attachment-section', () => ({ AttachmentSection: () => null }));
vi.mock('@/components/detail-properties-sidebar', () => ({
  DetailPropertiesSidebar: () => <div data-testid="sidebar" />,
}));

function taskFixture() {
  return {
    id: 'task-1',
    statusId: 'status-1',
    boardId: 'board-1',
    number: 1,
    taskNumber: 'TFG-1',
    title: 'Test task',
    priority: 'medium',
    position: 0,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };
}

describe('TaskDetailView — mobile (TFG-57)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(false);
  });

  it('calls useIsMobile even while the task query is loading (no rules-of-hooks crash)', async () => {
    // Structural pin: the mock calls a real hook, so a hook-order violation
    // (useIsMobile skipped on the loading render, called after the query
    // resolves) reproduces React's actual "Rendered more hooks" crash
    // instead of just observing a call count.
    mockUseIsMobile.mockImplementation(() => React.useState(false)[0]);
    mockUseTask.mockReturnValue({ data: undefined });
    const { TaskDetailView } = await import('./task-detail-view');

    expect(() => render(<TaskDetailView taskId="task-1" boardId="board-1" />)).not.toThrow();
    expect(mockUseIsMobile).toHaveBeenCalled();
  });

  it('does not crash when a loading task resolves into a mounted tree (hook count stable)', async () => {
    mockUseIsMobile.mockImplementation(() => React.useState(false)[0]);
    mockUseTask.mockReturnValue({ data: undefined });
    const { TaskDetailView } = await import('./task-detail-view');
    const { rerender } = render(<TaskDetailView taskId="task-1" boardId="board-1" />);

    mockUseTask.mockReturnValue({ data: taskFixture() });
    expect(() => rerender(<TaskDetailView taskId="task-1" boardId="board-1" />)).not.toThrow();
  });

  it('docks the sidebar beside the content on desktop', async () => {
    mockUseIsMobile.mockReturnValue(false);
    mockUseTask.mockReturnValue({ data: taskFixture() });
    const { TaskDetailView } = await import('./task-detail-view');
    const { queryByTestId, getByTestId } = render(
      <TaskDetailView taskId="task-1" boardId="board-1" />,
    );

    expect(queryByTestId('sheet')).toBeNull();
    expect(getByTestId('sidebar')).toBeInTheDocument();
  });

  it('renders the properties sidebar inside a Sheet on mobile', async () => {
    mockUseIsMobile.mockReturnValue(true);
    mockUseTask.mockReturnValue({ data: taskFixture() });
    const { TaskDetailView } = await import('./task-detail-view');
    const { getByTestId } = render(
      <TaskDetailView
        taskId="task-1"
        boardId="board-1"
        propertiesSheetOpen={true}
        onPropertiesSheetOpenChange={() => {}}
      />,
    );

    const sheet = getByTestId('sheet');
    expect(sheet.getAttribute('data-open')).toBe('true');
    expect(sheet.contains(getByTestId('sidebar'))).toBe(true);
  });
});
