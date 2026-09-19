import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { TaskDetailView } from './task-detail-view';

const mockUseSocket = vi.hoisted(() => vi.fn(() => ({ on: vi.fn() })));
const mockUseUsers = vi.hoisted(() => vi.fn(() => ({ data: [] })));
const mockUseUserDirectory = vi.hoisted(() => vi.fn(() => ({ data: [] })));
const mockAttachmentSection = vi.hoisted(() => vi.fn());
const mockCreateComment = vi.hoisted(() => vi.fn());
const mockUpdateComment = vi.hoisted(() => vi.fn());
const mockUploadAttachment = vi.hoisted(() => vi.fn());
const mockDetailComments = vi.hoisted(() => vi.fn());

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
  useCreateComment: () => ({ mutateAsync: mockCreateComment }),
  useDeleteComment: () => ({ mutate: vi.fn() }),
  useUpdateComment: () => ({ mutateAsync: mockUpdateComment }),
  useReactToComment: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/hooks/use-attachments', () => ({
  useUploadAttachment: () => ({ mutateAsync: mockUploadAttachment }),
}));

vi.mock('@/hooks/use-users', () => ({
  useUsers: mockUseUsers,
  useUserDirectory: mockUseUserDirectory,
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
vi.mock('@/components/detail-documents', () => ({
  DetailDocuments: () => <div data-testid="documents" />,
}));
vi.mock('@/components/attachment-section', () => ({
  AttachmentSection: (props: unknown) => {
    mockAttachmentSection(props);
    return <div data-testid="attachments" />;
  },
}));
vi.mock('@/components/detail-activity', () => ({
  DetailActivity: () => <div data-testid="activity" />,
}));
vi.mock('@/components/detail-comments', () => ({
  DetailComments: (props: unknown) => {
    mockDetailComments(props);
    return null;
  },
}));
vi.mock('@/components/detail-properties-sidebar', () => ({
  DetailPropertiesSidebar: () => null,
}));

describe('TaskDetailView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUsers.mockReturnValue({ data: [] } as never);
    mockUseUserDirectory.mockReturnValue({ data: [] } as never);
  });

  it('joins the task board socket room', () => {
    render(<TaskDetailView taskId="task-1" boardId="board-1" />);

    expect(mockUseSocket).toHaveBeenCalledWith('board-1');
  });

  it('sources assignee options from the user directory, not the admin-only users endpoint', () => {
    render(<TaskDetailView taskId="task-1" boardId="board-1" />);

    expect(mockUseUserDirectory).toHaveBeenCalled();
    expect(mockUseUsers).not.toHaveBeenCalled();
  });

  it('places task attachments after documents and before activity', () => {
    const { getByTestId } = render(<TaskDetailView taskId="task-1" boardId="board-1" />);

    expect(mockAttachmentSection).toHaveBeenCalledWith({
      subjectType: 'task',
      subjectId: 'task-1',
      boardId: 'board-1',
      taskId: 'task-1',
    });
    expect(getByTestId('documents').compareDocumentPosition(getByTestId('attachments'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(getByTestId('attachments').compareDocumentPosition(getByTestId('activity'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('creates a comment before uploading its queued files', async () => {
    const file = new File(['x'], 'note.txt', { type: 'text/plain' });
    mockCreateComment.mockResolvedValue({ id: 'comment-1' });
    mockUploadAttachment.mockResolvedValue({ id: 'attachment-1' });
    render(<TaskDetailView taskId="task-1" boardId="board-1" />);

    const props = mockDetailComments.mock.calls.at(-1)?.[0] as {
      onSubmit: (body: string, parentId?: string, files?: File[]) => Promise<unknown>;
    };
    await props.onSubmit('Body', undefined, [file]);

    expect(mockCreateComment).toHaveBeenCalledWith({
      taskId: 'task-1',
      author: 'user',
      body: 'Body',
      parentId: undefined,
    });
    expect(mockUploadAttachment).toHaveBeenCalledWith({
      subjectType: 'comment',
      subjectId: 'comment-1',
      boardId: 'board-1',
      taskId: 'task-1',
      file,
    });
  });

  it('updates a comment before uploading its queued files', async () => {
    const file = new File(['x'], 'note.txt', { type: 'text/plain' });
    mockUpdateComment.mockResolvedValue({ id: 'comment-1' });
    mockUploadAttachment.mockResolvedValue({ id: 'attachment-1' });
    render(<TaskDetailView taskId="task-1" boardId="board-1" />);

    const props = mockDetailComments.mock.calls.at(-1)?.[0] as {
      onEdit: (id: string, body: string, files?: File[]) => Promise<unknown>;
    };
    await props.onEdit('comment-1', 'Edited', [file]);

    expect(mockUpdateComment).toHaveBeenCalledWith({
      id: 'comment-1',
      body: 'Edited',
      taskId: 'task-1',
    });
    expect(mockUploadAttachment).toHaveBeenCalledWith({
      subjectType: 'comment',
      subjectId: 'comment-1',
      boardId: 'board-1',
      taskId: 'task-1',
      file,
    });
  });

  it('retries only failed root files without creating another comment', async () => {
    const uploaded = new File(['uploaded'], 'uploaded.txt', { type: 'text/plain' });
    const failed = new File(['failed'], 'failed.txt', { type: 'text/plain' });
    mockCreateComment.mockResolvedValue({ id: 'comment-1' });
    mockUploadAttachment.mockResolvedValueOnce({ id: 'attachment-1' });
    mockUploadAttachment.mockRejectedValueOnce(new Error('Upload failed'));
    mockUploadAttachment.mockResolvedValueOnce({ id: 'attachment-2' });
    render(<TaskDetailView taskId="task-1" boardId="board-1" />);

    const props = mockDetailComments.mock.calls.at(-1)?.[0] as {
      onSubmit: (
        body: string,
        parentId?: string,
        files?: File[],
        commentId?: string,
      ) => Promise<{ commentId: string; failedFiles: File[] }>;
    };
    const result = await props.onSubmit('Body', undefined, [uploaded, failed]);
    await props.onSubmit('Body', undefined, result.failedFiles, result.commentId);

    expect(result).toEqual({ commentId: 'comment-1', failedFiles: [failed] });
    expect(mockCreateComment).toHaveBeenCalledTimes(1);
    expect(mockUploadAttachment).toHaveBeenNthCalledWith(3, {
      subjectType: 'comment',
      subjectId: 'comment-1',
      boardId: 'board-1',
      taskId: 'task-1',
      file: failed,
    });
  });

  it('retries only failed reply files without creating another reply', async () => {
    const uploaded = new File(['uploaded'], 'uploaded.txt', { type: 'text/plain' });
    const failed = new File(['failed'], 'failed.txt', { type: 'text/plain' });
    mockCreateComment.mockResolvedValue({ id: 'reply-1' });
    mockUploadAttachment.mockResolvedValueOnce({ id: 'attachment-1' });
    mockUploadAttachment.mockRejectedValueOnce(new Error('Upload failed'));
    mockUploadAttachment.mockResolvedValueOnce({ id: 'attachment-2' });
    render(<TaskDetailView taskId="task-1" boardId="board-1" />);

    const props = mockDetailComments.mock.calls.at(-1)?.[0] as {
      onSubmit: (
        body: string,
        parentId?: string,
        files?: File[],
        commentId?: string,
      ) => Promise<{ commentId: string; failedFiles: File[] }>;
    };
    const result = await props.onSubmit('Reply', 'parent-1', [uploaded, failed]);
    await props.onSubmit('Reply', 'parent-1', result.failedFiles, result.commentId);

    expect(mockCreateComment).toHaveBeenCalledTimes(1);
    expect(mockCreateComment).toHaveBeenCalledWith({
      taskId: 'task-1',
      author: 'user',
      body: 'Reply',
      parentId: 'parent-1',
    });
    expect(mockUploadAttachment).toHaveBeenNthCalledWith(3, {
      subjectType: 'comment',
      subjectId: 'reply-1',
      boardId: 'board-1',
      taskId: 'task-1',
      file: failed,
    });
  });

  it('retries only failed edit files without updating the comment again', async () => {
    const uploaded = new File(['uploaded'], 'uploaded.txt', { type: 'text/plain' });
    const failed = new File(['failed'], 'failed.txt', { type: 'text/plain' });
    mockUpdateComment.mockResolvedValue({ id: 'comment-1' });
    mockUploadAttachment.mockResolvedValueOnce({ id: 'attachment-1' });
    mockUploadAttachment.mockRejectedValueOnce(new Error('Upload failed'));
    mockUploadAttachment.mockResolvedValueOnce({ id: 'attachment-2' });
    render(<TaskDetailView taskId="task-1" boardId="board-1" />);

    const props = mockDetailComments.mock.calls.at(-1)?.[0] as {
      onEdit: (
        id: string,
        body: string,
        files?: File[],
        skipUpdate?: boolean,
      ) => Promise<{ commentId: string; failedFiles: File[] }>;
    };
    const result = await props.onEdit('comment-1', 'Edited', [uploaded, failed]);
    await props.onEdit('comment-1', 'Edited', result.failedFiles, true);

    expect(mockUpdateComment).toHaveBeenCalledTimes(1);
    expect(mockUploadAttachment).toHaveBeenNthCalledWith(3, {
      subjectType: 'comment',
      subjectId: 'comment-1',
      boardId: 'board-1',
      taskId: 'task-1',
      file: failed,
    });
  });
});
