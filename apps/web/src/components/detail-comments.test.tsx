/**
 * Tests for DetailComments delete feature (TFG-8).
 *
 * Tests:
 * - Delete button not shown when onDelete is not provided
 * - Delete button not shown for comments by other users (non-admin)
 * - Delete button shown for user's own comments
 * - Delete button shown for any comment when user is admin
 * - Delete button shown for anonymous comments only to admin
 * - Hover behavior: hidden on desktop, visible on mobile (CSS class check)
 * - Comment bodies render as markdown, not literal source
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetailComments } from './detail-comments';
import type { Comment } from '@/types';

// ── Mocks ────────────────────────────────────────────────────────────────────

let mockUser: { id: string; role: string } | null = {
  id: 'user-1',
  role: 'member',
};
let mockMembers: { userId: string; role: string }[] | undefined = [];

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/hooks/use-users', () => ({
  useUserDirectory: () => ({ data: [] }),
}));

vi.mock('@/hooks/use-settings', () => ({
  useSettings: () => ({ data: undefined }),
}));

vi.mock('@/hooks/use-members', () => ({
  useMembers: () => ({ data: mockMembers }),
}));

vi.mock('@/hooks/use-attachments', () => ({
  useDeleteAttachment: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    taskId: 't1',
    author: 'Alice',
    authorId: 'user-1',
    body: 'Looks good',
    parentId: null,
    deletedAt: null,
    replies: [],
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderComments(
  comments: Comment[],
  onDelete?: (id: string) => void,
  user: { id: string; role: string } | null = mockUser,
  onEdit?: (id: string, body: string) => void,
  onReact?: (commentId: string, emoji: string) => void,
) {
  mockUser = user;
  return render(
    <DetailComments
      comments={comments}
      onSubmit={vi.fn()}
      onDelete={onDelete}
      onEdit={onEdit}
      onReact={onReact}
      formatTimestamp={(ts) => ts}
      boardId="b1"
      taskId="t1"
    />,
  );
}

describe('DetailComments — delete feature (TFG-8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mockUser to default (non-admin member)
    mockUser = { id: 'user-1', role: 'member' };
    mockMembers = [];
  });

  it('does not show delete button when onDelete is not provided', () => {
    const comment = makeComment();
    render(<DetailComments comments={[comment]} onSubmit={vi.fn()} formatTimestamp={vi.fn()} />);
    expect(screen.queryByLabelText('Comment actions')).not.toBeInTheDocument();
  });

  it("does not show delete button for other user's comments (non-admin)", () => {
    const comment = makeComment({ authorId: 'other-user' });
    renderComments([comment], vi.fn());
    expect(screen.queryByLabelText('Comment actions')).not.toBeInTheDocument();
  });

  it("renders delete action for user's own comments", () => {
    const comment = makeComment({ authorId: 'user-1' });
    renderComments([comment], vi.fn());
    expect(screen.getByLabelText('Comment actions')).toBeInTheDocument();
  });

  it('renders delete action for any comment when user is admin', () => {
    const comment = makeComment({ authorId: 'other-user' });
    renderComments([comment], vi.fn(), { id: 'admin-1', role: 'admin' });
    expect(screen.getByLabelText('Comment actions')).toBeInTheDocument();
  });

  it('renders delete action for anonymous (authorId null) comments when admin', () => {
    const comment = makeComment({ authorId: null, author: 'system' });
    renderComments([comment], vi.fn(), { id: 'admin-1', role: 'admin' });
    expect(screen.getByLabelText('Comment actions')).toBeInTheDocument();
  });

  it('does not render delete action for anonymous comments when non-admin', () => {
    const comment = makeComment({ authorId: null, author: 'system' });
    renderComments([comment], vi.fn());
    expect(screen.queryByLabelText('Comment actions')).not.toBeInTheDocument();
  });

  it('renders the body as markdown once the editor chunk loads', async () => {
    const comment = makeComment({ body: '**bold** and [link](https://x.com)' });
    renderComments([comment]);

    // The lazy MarkdownEditor resolves asynchronously; before it does, the
    // skeleton shows the raw source.
    const strong = await screen.findByText('bold');
    expect(strong.tagName).toBe('STRONG');

    const link = screen.getByRole('link', { name: 'link' });
    expect(link).toHaveAttribute('href', 'https://x.com');
    expect(screen.queryByText(/\*\*bold\*\*/)).not.toBeInTheDocument();
  });

  it('delete button has mobile-visible (opacity-100) and desktop-hover (md:opacity-0) classes', () => {
    const comment = makeComment({ authorId: 'user-1' });
    renderComments([comment], vi.fn());
    const btn = screen.getByLabelText('Comment actions');
    expect(btn.className).toContain('opacity-100');
    expect(btn.className).toContain('md:opacity-0');
  });

  // ── Edit mode + edited indicator (TFG-32) ───────────────────────────────

  it('renders "(edited)" indicator when editedAt is set', () => {
    const comment = makeComment({ editedAt: '2026-01-02T00:00:00Z' });
    renderComments([comment]);
    expect(screen.getByText('(edited)')).toBeInTheDocument();
  });

  it('does not render "(edited)" when editedAt is null/undefined', () => {
    const comment = makeComment();
    renderComments([comment]);
    expect(screen.queryByText('(edited)')).not.toBeInTheDocument();
  });

  it('shows an Edit action in the menu for the author', async () => {
    const comment = makeComment({ authorId: 'user-1' });
    renderComments([comment], vi.fn(), undefined, vi.fn());
    await userEvent.click(screen.getByLabelText('Comment actions'));
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('calls onEdit when the Edit action is clicked and Save is pressed', async () => {
    const comment = makeComment({ authorId: 'user-1' });
    const onEdit = vi.fn();
    renderComments([comment], vi.fn(), undefined, onEdit);
    await userEvent.click(screen.getByLabelText('Comment actions'));
    await userEvent.click(screen.getByText('Edit'));
    const textarea = screen.getByDisplayValue(comment.body) as HTMLTextAreaElement;
    expect(textarea).toHaveAttribute('aria-label', 'Edit comment');
    fireEvent.change(textarea, { target: { value: 'updated body' } });
    fireEvent.click(screen.getByText('Save'));
    expect(onEdit).toHaveBeenCalledWith(comment.id, 'updated body');
  });

  it('restores the original body when Cancel is pressed in edit mode', async () => {
    const comment = makeComment({ authorId: 'user-1', body: 'original' });
    const onEdit = vi.fn();
    renderComments([comment], vi.fn(), undefined, onEdit);
    await userEvent.click(screen.getByLabelText('Comment actions'));
    await userEvent.click(screen.getByText('Edit'));
    const textarea = screen.getByDisplayValue('original') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'changed' } });
    fireEvent.click(screen.getByText('Cancel'));
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue('changed')).not.toBeInTheDocument();
  });

  // ── Reactions (TFG-32) ──────────────────────────────────────────────────

  it('renders reaction chips with counts', () => {
    const comment = makeComment({
      authorId: 'user-1',
      reactions: [{ emoji: '👍', userIds: ['user-1', 'user-2'] }],
    });
    renderComments([comment], undefined, undefined, undefined, vi.fn());
    const chip = screen.getByLabelText('👍 reaction, 2 reactors');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent('👍2');
  });

  it('calls onReact when an existing reaction chip is clicked', () => {
    const comment = makeComment({
      authorId: 'user-1',
      reactions: [{ emoji: '👍', userIds: ['user-1'] }],
    });
    const onReact = vi.fn();
    renderComments([comment], undefined, undefined, undefined, onReact);
    fireEvent.click(screen.getByLabelText('👍 reaction, 1 reactors'));
    expect(onReact).toHaveBeenCalledWith(comment.id, '👍');
  });

  it('opens the emoji picker and calls onReact on selection', () => {
    const comment = makeComment({ authorId: 'user-1' });
    const onReact = vi.fn();
    renderComments([comment], undefined, undefined, undefined, onReact);
    fireEvent.click(screen.getByLabelText('Add reaction'));
    fireEvent.click(screen.getByLabelText('React with 🎉'));
    expect(onReact).toHaveBeenCalledWith(comment.id, '🎉');
    expect(screen.queryByLabelText('React with 🎉')).not.toBeInTheDocument();
  });

  it('highlights the chip the user has reacted on with a stronger neutral border', () => {
    const comment = makeComment({
      authorId: 'user-1',
      reactions: [{ emoji: '👍', userIds: ['user-1'] }],
    });
    renderComments([comment], undefined, undefined, undefined, vi.fn());
    const chip = screen.getByLabelText('👍 reaction, 1 reactors');
    expect(chip.className).toContain('border-foreground/40');
    expect(chip.className).toContain('text-foreground');
  });
});

describe('DetailComments — threaded replies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'user-1', role: 'member' };
    mockMembers = [];
  });

  it('renders replies nested under their parent', async () => {
    const parent = makeComment({
      id: 'c1',
      body: 'root body',
      replies: [makeComment({ id: 'c2', body: 'nested body' })],
    });
    renderComments([parent]);
    expect(await screen.findByText('root body')).toBeInTheDocument();
    expect(await screen.findByText('nested body')).toBeInTheDocument();
  });

  it('shows a "N replies" toggle with aria-expanded and collapses the subtree on click', async () => {
    const parent = makeComment({
      id: 'c1',
      body: 'root body',
      replies: [
        makeComment({ id: 'c2', body: 'reply one' }),
        makeComment({ id: 'c3', body: 'reply two' }),
      ],
    });
    renderComments([parent]);

    const toggle = await screen.findByText('2 replies');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('reply one')).toBeInTheDocument();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('reply one')).not.toBeInTheDocument();
    expect(screen.queryByText('reply two')).not.toBeInTheDocument();
  });

  it('opens the reply composer and submits with the parent id', async () => {
    const parent = makeComment({ id: 'c1', body: 'root body' });
    const onSubmit = vi.fn();
    render(<DetailComments comments={[parent]} onSubmit={onSubmit} formatTimestamp={(ts) => ts} />);

    await userEvent.click(screen.getByLabelText('Reply to Alice'));
    const textarea = screen.getByPlaceholderText('Reply to Alice…');
    fireEvent.change(textarea, { target: { value: 'my reply' } });
    fireEvent.click(screen.getByText('Reply'));
    expect(onSubmit).toHaveBeenCalledWith('my reply', 'c1');
    expect(screen.queryByPlaceholderText('Reply to Alice…')).not.toBeInTheDocument();
  });

  it('queues root files with the body until a new comment is created', async () => {
    const onSubmit = vi.fn().mockResolvedValue(makeComment({ id: 'c-new' }));
    const file = new File(['x'], 'note.txt', { type: 'text/plain' });
    render(
      <DetailComments
        comments={[]}
        onSubmit={onSubmit}
        formatTimestamp={(value) => value}
        boardId="b1"
        taskId="t1"
      />,
    );

    await userEvent.upload(screen.getByLabelText('Attach to comment'), file);
    await userEvent.type(screen.getByPlaceholderText('Add a comment…'), 'Body');
    await userEvent.click(screen.getByRole('button', { name: 'Submit comment' }));

    expect(onSubmit).toHaveBeenCalledWith('Body', undefined, [file]);
  });

  it('retains a root draft and its files when comment creation fails', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Request failed'));
    const file = new File(['x'], 'note.txt', { type: 'text/plain' });
    render(
      <DetailComments
        comments={[]}
        onSubmit={onSubmit}
        formatTimestamp={(value) => value}
        boardId="b1"
        taskId="t1"
      />,
    );

    await userEvent.upload(screen.getByLabelText('Attach to comment'), file);
    await userEvent.type(screen.getByPlaceholderText('Add a comment…'), 'Body');
    await userEvent.click(screen.getByRole('button', { name: 'Submit comment' }));

    expect(screen.getByPlaceholderText('Add a comment…')).toHaveValue('Body');
    expect(screen.getByText('note.txt')).toBeInTheDocument();
  });

  it('retains only failed root files and retries them against the created comment', async () => {
    const uploaded = new File(['uploaded'], 'uploaded.txt', { type: 'text/plain' });
    const failed = new File(['failed'], 'failed.txt', { type: 'text/plain' });
    const onSubmit = vi
      .fn()
      .mockResolvedValueOnce({ commentId: 'c-new', failedFiles: [failed] })
      .mockResolvedValueOnce({ commentId: 'c-new', failedFiles: [] });
    render(
      <DetailComments
        comments={[]}
        onSubmit={onSubmit}
        formatTimestamp={(value) => value}
        boardId="b1"
        taskId="t1"
      />,
    );

    await userEvent.upload(screen.getByLabelText('Attach to comment'), [uploaded, failed]);
    await userEvent.type(screen.getByPlaceholderText('Add a comment…'), 'Body');
    await userEvent.click(screen.getByRole('button', { name: 'Submit comment' }));

    expect(screen.getByPlaceholderText('Add a comment…')).toHaveValue('Body');
    expect(screen.queryByText('uploaded.txt')).not.toBeInTheDocument();
    expect(screen.getByText('failed.txt')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Submit comment' }));

    expect(onSubmit).toHaveBeenLastCalledWith('Body', undefined, [failed], 'c-new');
  });

  it('locks the root composer while submitting and after a partial upload until retry', async () => {
    const uploaded = new File(['uploaded'], 'uploaded.txt', { type: 'text/plain' });
    const failed = new File(['failed'], 'failed.txt', { type: 'text/plain' });
    let resolve: (value: { commentId: string; failedFiles: File[] }) => void;
    const onSubmit = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<{ commentId: string; failedFiles: File[] }>((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValueOnce({ commentId: 'c-new', failedFiles: [] });
    render(
      <DetailComments
        comments={[]}
        onSubmit={onSubmit}
        formatTimestamp={(value) => value}
        boardId="b1"
        taskId="t1"
      />,
    );

    await userEvent.upload(screen.getByLabelText('Attach to comment'), [uploaded, failed]);
    await userEvent.type(screen.getByPlaceholderText('Add a comment…'), 'Body');
    await userEvent.click(screen.getByRole('button', { name: 'Submit comment' }));

    expect(screen.getByRole('button', { name: 'Submit comment' })).toBeDisabled();
    expect(screen.getByLabelText('Attach to comment')).toBeDisabled();
    expect(screen.getByPlaceholderText('Add a comment…')).toBeDisabled();
    expect(onSubmit).toHaveBeenCalledTimes(1);

    resolve!({ commentId: 'c-new', failedFiles: [failed] });
    await waitFor(() => expect(screen.getByText('failed.txt')).toBeInTheDocument());

    expect(screen.getByPlaceholderText('Add a comment…')).toBeDisabled();
    expect(screen.queryByText('uploaded.txt')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Submit comment' }));
    expect(onSubmit).toHaveBeenLastCalledWith('Body', undefined, [failed], 'c-new');
  });

  it('queues reply files with the parent id', async () => {
    const parent = makeComment({ id: 'c1', body: 'root body' });
    const onSubmit = vi.fn().mockResolvedValue(makeComment({ id: 'c-new' }));
    const file = new File(['x'], 'reply.txt', { type: 'text/plain' });
    render(
      <DetailComments
        comments={[parent]}
        onSubmit={onSubmit}
        formatTimestamp={(value) => value}
        boardId="b1"
        taskId="t1"
      />,
    );

    await userEvent.click(screen.getByLabelText('Reply to Alice'));
    await userEvent.upload(screen.getByLabelText('Attach to reply'), file);
    await userEvent.type(screen.getByPlaceholderText('Reply to Alice…'), 'Reply');
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));

    expect(onSubmit).toHaveBeenCalledWith('Reply', 'c1', [file]);
  });

  it('locks a reply while submitting and retries only failed files', async () => {
    const parent = makeComment({ id: 'c1', body: 'root body' });
    const uploaded = new File(['uploaded'], 'uploaded.txt', { type: 'text/plain' });
    const failed = new File(['failed'], 'failed.txt', { type: 'text/plain' });
    let resolve: (value: { commentId: string; failedFiles: File[] }) => void;
    const onSubmit = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<{ commentId: string; failedFiles: File[] }>((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValueOnce({ commentId: 'reply-new', failedFiles: [] });
    render(
      <DetailComments
        comments={[parent]}
        onSubmit={onSubmit}
        formatTimestamp={(value) => value}
        boardId="b1"
        taskId="t1"
      />,
    );

    await userEvent.click(screen.getByLabelText('Reply to Alice'));
    await userEvent.upload(screen.getByLabelText('Attach to reply'), [uploaded, failed]);
    await userEvent.type(screen.getByPlaceholderText('Reply to Alice…'), 'Reply');
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));

    expect(screen.getByRole('button', { name: 'Reply' })).toBeDisabled();
    expect(screen.getByLabelText('Attach to reply')).toBeDisabled();
    resolve!({ commentId: 'reply-new', failedFiles: [failed] });
    await waitFor(() => expect(screen.getByText('failed.txt')).toBeInTheDocument());

    expect(screen.getByPlaceholderText('Reply to Alice…')).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));
    expect(onSubmit).toHaveBeenLastCalledWith('Reply', 'c1', [failed], 'reply-new');
  });

  it('queues edit files with the updated body', async () => {
    const comment = makeComment({ authorId: 'user-1' });
    const onEdit = vi.fn().mockResolvedValue(comment);
    const file = new File(['x'], 'edit.txt', { type: 'text/plain' });
    renderComments([comment], undefined, undefined, onEdit);

    await userEvent.click(screen.getByLabelText('Comment actions'));
    await userEvent.click(screen.getByText('Edit'));
    await userEvent.upload(screen.getByLabelText('Attach to edit'), file);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onEdit).toHaveBeenCalledWith('c1', 'Looks good', [file]);
  });

  it('locks an edit while saving and retries only failed files without another update', async () => {
    const comment = makeComment({ authorId: 'user-1' });
    const uploaded = new File(['uploaded'], 'uploaded.txt', { type: 'text/plain' });
    const failed = new File(['failed'], 'failed.txt', { type: 'text/plain' });
    let resolve: (value: { commentId: string; failedFiles: File[] }) => void;
    const onEdit = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<{ commentId: string; failedFiles: File[] }>((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValueOnce({ commentId: 'c1', failedFiles: [] });
    render(
      <DetailComments
        comments={[comment]}
        onSubmit={vi.fn()}
        onEdit={onEdit}
        formatTimestamp={(value) => value}
        boardId="b1"
        taskId="t1"
      />,
    );

    await userEvent.click(screen.getByLabelText('Comment actions'));
    await userEvent.click(screen.getByText('Edit'));
    await userEvent.upload(screen.getByLabelText('Attach to edit'), [uploaded, failed]);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByLabelText('Attach to edit')).toBeDisabled();
    resolve!({ commentId: 'c1', failedFiles: [failed] });
    await waitFor(() => expect(screen.getByText('failed.txt')).toBeInTheDocument());

    expect(screen.getByLabelText('Edit comment')).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onEdit).toHaveBeenLastCalledWith('c1', 'Looks good', [failed], true);
  });

  it('only shows comment attachment controls to authorized users', () => {
    const { rerender } = render(
      <DetailComments
        comments={[]}
        onSubmit={vi.fn()}
        formatTimestamp={(value) => value}
        boardId="b1"
        taskId="t1"
      />,
    );
    expect(screen.getByLabelText('Attach to comment')).toBeInTheDocument();

    mockMembers = [{ userId: 'user-1', role: 'viewer' }];
    rerender(
      <DetailComments
        comments={[]}
        onSubmit={vi.fn()}
        formatTimestamp={(value) => value}
        boardId="b1"
        taskId="t1"
      />,
    );
    expect(screen.queryByLabelText('Attach to comment')).not.toBeInTheDocument();

    mockMembers = [{ userId: 'other', role: 'member' }];
    rerender(
      <DetailComments
        comments={[]}
        onSubmit={vi.fn()}
        formatTimestamp={(value) => value}
        boardId="b1"
        taskId="t1"
      />,
    );
    expect(screen.queryByLabelText('Attach to comment')).not.toBeInTheDocument();

    mockMembers = [{ userId: 'user-1', role: 'member' }];
    rerender(
      <DetailComments
        comments={[]}
        onSubmit={vi.fn()}
        formatTimestamp={(value) => value}
        boardId="b1"
        taskId="t1"
      />,
    );
    expect(screen.getByLabelText('Attach to comment')).toBeInTheDocument();

    mockUser = { id: 'admin-1', role: 'admin' };
    rerender(
      <DetailComments
        comments={[]}
        onSubmit={vi.fn()}
        formatTimestamp={(value) => value}
        boardId="b1"
        taskId="t1"
      />,
    );
    expect(screen.getByLabelText('Attach to comment')).toBeInTheDocument();
  });

  it('cancels the reply composer without submitting', async () => {
    const parent = makeComment({ id: 'c1', body: 'root body' });
    const onSubmit = vi.fn();
    render(<DetailComments comments={[parent]} onSubmit={onSubmit} formatTimestamp={(ts) => ts} />);

    await userEvent.click(screen.getByLabelText('Reply to Alice'));
    fireEvent.change(screen.getByPlaceholderText('Reply to Alice…'), {
      target: { value: 'draft' },
    });
    fireEvent.click(screen.getByText('Cancel'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText('Reply to Alice…')).not.toBeInTheDocument();
  });

  it('renders a tombstone inert while a live reply under it stays interactive', () => {
    const parent = makeComment({
      id: 'c1',
      body: '',
      deletedAt: '2026-01-02T00:00:00Z',
      authorId: 'user-1',
      author: 'Alice',
      replies: [
        makeComment({ id: 'c2', body: 'surviving reply', authorId: 'user-2', author: 'Bob' }),
      ],
    });
    renderComments([parent], vi.fn(), undefined, vi.fn(), vi.fn());

    expect(screen.getByText('deleted')).toBeInTheDocument();
    expect(screen.getByText('surviving reply')).toBeInTheDocument();
    // The tombstone is inert even though the live user authored it — deletedAt
    // gates menu actions per-node (no menu, no reply button). The reply is by
    // another author, so document-wide "no Comment actions" proves gating:
    // without deletedAt the author would see a menu only on the tombstone.
    expect(screen.queryByLabelText('Comment actions')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Reply to Alice')).not.toBeInTheDocument();
    // The live reply (different author) keeps its actions under the tombstone.
    expect(screen.getByLabelText('Reply to Bob')).toBeInTheDocument();
  });

  it('renders chips beneath live comments but not tombstones', () => {
    const live = makeComment({
      id: 'live',
      attachments: [
        {
          id: 'a1',
          subjectType: 'comment',
          subjectId: 'live',
          filename: 'live.txt',
          mimeType: 'text/plain',
          sizeBytes: 1,
          uploaderId: 'user-1',
          uploader: null,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
    });
    const tombstone = makeComment({
      id: 'deleted',
      body: '',
      deletedAt: '2026-01-02T00:00:00Z',
      attachments: [
        {
          id: 'a2',
          subjectType: 'comment',
          subjectId: 'deleted',
          filename: 'deleted.txt',
          mimeType: 'text/plain',
          sizeBytes: 1,
          uploaderId: 'user-1',
          uploader: null,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
    });
    render(
      <DetailComments
        comments={[live, tombstone]}
        onSubmit={vi.fn()}
        formatTimestamp={(value) => value}
        boardId="b1"
        taskId="t1"
      />,
    );

    expect(screen.getByText('live.txt')).toBeInTheDocument();
    expect(screen.queryByText('deleted.txt')).not.toBeInTheDocument();
  });

  it('counts only visible (non-deleted) comments in the header', async () => {
    const parent = makeComment({
      id: 'c1',
      body: 'root body',
      replies: [
        makeComment({ id: 'c2', body: 'visible reply' }),
        makeComment({ id: 'c3', body: '', deletedAt: '2026-01-02T00:00:00Z' }),
      ],
    });
    renderComments([parent]);

    const heading = await screen.findByRole('heading', { name: /comments/i });
    expect(heading).toHaveTextContent('Comments (2)');
  });
});
