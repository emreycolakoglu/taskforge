/**
 * TFG-57 — inbox mobile compatibility.
 *
 * On phones the inbox detail pane must expose the properties sidebar (Sheet
 * wiring through TaskDetailView); the pane renders a mobile-only properties
 * trigger in its header, mirroring the task detail page's breadcrumb trigger.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockUseIsMobile = vi.hoisted(() => vi.fn(() => false));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: mockUseIsMobile,
}));

vi.mock('@/hooks/use-socket', () => ({
  useSocket: () => ({ on: vi.fn() }),
}));

const mockUseTask = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-tasks', () => ({
  useTask: mockUseTask,
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

vi.mock('@/hooks/use-projects', () => ({
  useProjects: () => ({ data: [] }),
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

const notification = {
  id: 'notif-1',
  taskId: 'task-1',
  readAt: '2026-01-01T00:00:00Z',
} as never;

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

describe('InboxTaskDetail — mobile properties sheet (TFG-57)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(false);
    mockUseTask.mockReturnValue({ data: taskFixture() });
  });

  it('renders the detail pane without a properties trigger on desktop', async () => {
    const { InboxTaskDetail } = await import('@/components/inbox-task-detail');
    const { queryByRole } = render(
      <MemoryRouter initialEntries={['/inbox/notif-1']}>
        <InboxTaskDetail notification={notification} onNavigateTask={() => {}} />
      </MemoryRouter>,
    );

    expect(queryByRole('button', { name: /properties/i })).toBeNull();
  });

  it('renders a properties trigger on mobile and opens the sidebar Sheet', async () => {
    mockUseIsMobile.mockReturnValue(true);
    const { InboxTaskDetail } = await import('@/components/inbox-task-detail');
    const { getByTestId, getByRole } = render(
      <MemoryRouter initialEntries={['/inbox/notif-1']}>
        <InboxTaskDetail notification={notification} onNavigateTask={() => {}} />
      </MemoryRouter>,
    );

    expect(getByRole('button', { name: /properties/i })).toBeInTheDocument();
    expect(getByTestId('sheet').getAttribute('data-open')).toBe('false');

    fireEvent.click(getByRole('button', { name: /properties/i }));
    expect(getByTestId('sheet').getAttribute('data-open')).toBe('true');
    expect(getByTestId('sheet').contains(getByTestId('sidebar'))).toBe(true);
  });
});
