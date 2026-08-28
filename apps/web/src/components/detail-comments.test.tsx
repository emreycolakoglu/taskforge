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
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetailComments } from './detail-comments';
import type { Comment } from '@/types';

// ── Mocks ────────────────────────────────────────────────────────────────────

let mockUser: { id: string; role: string } | null = {
  id: 'user-1',
  role: 'member',
};

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: mockUser }),
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
    />,
  );
}

describe('DetailComments — delete feature (TFG-8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mockUser to default (non-admin member)
    mockUser = { id: 'user-1', role: 'member' };
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
  });

  it('highlights the chip the user has reacted on with border-primary/40', () => {
    const comment = makeComment({
      authorId: 'user-1',
      reactions: [{ emoji: '👍', userIds: ['user-1'] }],
    });
    renderComments([comment], undefined, undefined, undefined, vi.fn());
    const chip = screen.getByLabelText('👍 reaction, 1 reactors');
    expect(chip.className).toContain('border-primary/40');
  });
});
