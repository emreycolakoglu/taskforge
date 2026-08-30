import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { TaskDetailView } from './task-detail-view';

const mockUseSocket = vi.hoisted(() => vi.fn(() => ({ on: vi.fn() })));

vi.mock('@/hooks/use-socket', () => ({
  useSocket: mockUseSocket,
}));

vi.mock('@/hooks/use-tasks', () => ({
  useTask: () => ({
    data: {
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
    },
  }),
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
  useCreateComment: () => ({ mutate: vi.fn() }),
  useDeleteComment: () => ({ mutate: vi.fn() }),
  useUpdateComment: () => ({ mutate: vi.fn() }),
  useReactToComment: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/hooks/use-users', () => ({
  useUsers: () => ({ data: [] }),
  useUserDirectory: () => ({ data: [] }),
}));

vi.mock('@/hooks/use-labels', () => ({
  useLabels: () => ({ data: [] }),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/detail-title-block', () => ({ DetailTitleBlock: () => null }));
vi.mock('@/components/detail-description-editor', () => ({ DetailDescriptionEditor: () => null }));
vi.mock('@/components/detail-sub-issues', () => ({ DetailSubIssues: () => null }));
vi.mock('@/components/detail-documents', () => ({ DetailDocuments: () => null }));
vi.mock('@/components/detail-activity', () => ({ DetailActivity: () => null }));
vi.mock('@/components/detail-comments', () => ({ DetailComments: () => null }));
vi.mock('@/components/detail-properties-sidebar', () => ({
  DetailPropertiesSidebar: () => null,
}));

describe('TaskDetailView', () => {
  beforeEach(() => vi.clearAllMocks());

  it('joins the task board socket room', () => {
    render(<TaskDetailView taskId="task-1" boardId="board-1" />);

    expect(mockUseSocket).toHaveBeenCalledWith('board-1');
  });
});
