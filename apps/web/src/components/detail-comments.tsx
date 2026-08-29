/**
 * DetailComments — threaded comments + composer.
 *
 * Composer at top: Textarea (rows=2) + Submit (outline, NOT Lime — design.md:
 * detail page has no primary creation action). Enter submits, Shift+Enter
 * newline. Comments render as a server-built tree: roots newest-first, replies
 * nested under their parent with a Graphite left border, oldest-first. Any
 * comment with children gets a mono "N replies" expand/collapse toggle
 * (aria-expanded, expanded by default). A Reply button (hover reveal) opens one
 * inline composer at a time; submitting calls onSubmit(body, parentId) — the
 * parent mutation invalidates and re-fetches the whole tree.
 *
 * Tombstones (deletedAt set, body blanked by the server): rendered as a muted
 * mono "deleted" marker — no body, menu, reactions, or reply button. Children
 * of a tombstone keep rendering in place. Header counts visible comments only.
 *
 * Edit: the three-dot menu shows "Edit" above "Delete" for the author/admin.
 * Edit mode swaps the read-only MarkdownEditor for a Textarea + Save/Cancel.
 * Save → onEdit(id, body). Enter submits, Shift+Enter newline (same as composer).
 *
 * Reactions: a chip row under each body. Existing reactions render as
 * `emoji count` chips; clicking a chip you've reacted on toggles off, clicking
 * one you haven't toggles on. A Smile button opens a Popover with the curated
 * emoji grid. Chips use border/bg tokens — no Lime (reactions are content,
 * not primary CTAs).
 *
 * "(edited)" appears next to the timestamp when editedAt is set (font-mono,
 * muted). Set on first edit only (server-side).
 */

import { useMemo, useState } from 'react';
import { MessageSquare, MoreHorizontal, Trash2, Pencil, Smile, Reply } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MarkdownEditor } from '@/components/markdown';
import { useAuth } from '@/contexts/auth-context';
import { REACTION_EMOJIS } from '@/lib/reactions';
import type { Comment } from '@/types';

interface DetailCommentsProps {
  comments: Comment[];
  onSubmit: (body: string, parentId?: string) => void;
  onDelete?: (commentId: string) => void;
  onEdit?: (commentId: string, body: string) => void;
  onReact?: (commentId: string, emoji: string) => void;
  formatTimestamp: (ts: string) => string;
}

function countVisible(comments: Comment[] | undefined): number {
  if (!comments) return 0;
  return comments.reduce((n, c) => n + (c.deletedAt ? 0 : 1) + countVisible(c.replies), 0);
}

export function DetailComments({
  comments,
  onSubmit,
  onDelete,
  onEdit,
  onReact,
  formatTimestamp,
}: DetailCommentsProps) {
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [reactPickerFor, setReactPickerFor] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(new Set());
  const { user } = useAuth();

  const submit = () => {
    if (!text.trim()) return;
    onSubmit(text.trim());
    setText('');
  };

  const visibleCount = useMemo(() => countVisible(comments), [comments]);

  const closeReply = () => {
    setReplyTo(null);
    setReplyText('');
  };

  const submitReply = () => {
    if (!replyTo || !replyText.trim()) return;
    onSubmit(replyText.trim(), replyTo);
    closeReply();
  };

  const openReply = (commentId: string) => {
    setReplyTo((prev) => (prev === commentId ? null : commentId));
    setReplyText('');
  };

  const toggleCollapsed = (id: string) =>
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const canModify = (c: Comment) => {
    if (c.deletedAt) return false;
    if (!user || !onEdit) return false;
    if (!c.authorId) return user.role === 'admin';
    return c.authorId === user.id || user.role === 'admin';
  };

  const canDelete = (c: Comment) => {
    if (c.deletedAt) return false;
    if (!user || !onDelete) return false;
    if (!c.authorId) return user.role === 'admin';
    return c.authorId === user.id || user.role === 'admin';
  };

  const startEdit = (c: Comment) => {
    setEditingId(c.id);
    setEditBody(c.body);
  };

  const saveEdit = () => {
    if (!editingId || !editBody.trim()) return;
    onEdit!(editingId, editBody.trim());
    setEditingId(null);
    setEditBody('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditBody('');
  };

  const hasReacted = (c: Comment, emoji: string) =>
    !!user && !!c.reactions?.some((r) => r.emoji === emoji && r.userIds.includes(user.id));

  const renderNode = (c: Comment, depth: number, insideTombstone = false) => {
    const isEditing = editingId === c.id;
    const isDeleted = !!c.deletedAt;
    const frozen = insideTombstone || isDeleted;
    const replies = c.replies ?? [];
    const collapsed = collapsedIds.has(c.id);
    const showMenu = !frozen && (canDelete(c) || canModify(c));

    return (
      <div
        key={c.id}
        className={depth === 0 ? 'group py-3 border-b border-border last:border-0' : 'group py-3'}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{c.author}</span>
          <span className="text-xs font-mono text-muted-foreground">
            {formatTimestamp(c.createdAt)}
          </span>
          {c.editedAt && <span className="text-xs font-mono text-muted-foreground">(edited)</span>}
          {replies.length > 0 && (
            <button
              type="button"
              onClick={() => toggleCollapsed(c.id)}
              aria-expanded={!collapsed}
              className="text-xs font-mono text-muted-foreground hover:text-foreground"
            >
              {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
            </button>
          )}
          {(showMenu || (!isDeleted && !frozen)) && (
            <div className="ml-auto flex items-center gap-0.5">
              {!isDeleted && !frozen && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 text-muted-foreground hover:text-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                  aria-label={`Reply to ${c.author}`}
                  onClick={() => openReply(c.id)}
                >
                  <Reply className="size-3.5" />
                </Button>
              )}
              {showMenu && (
                <DropdownMenu>
                  {/* ⋯ menu — unchanged from the flat version */}
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-muted-foreground hover:text-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                      aria-label="Comment actions"
                    >
                      <MoreHorizontal className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canModify(c) && (
                      <DropdownMenuItem onClick={() => startEdit(c)}>
                        <Pencil className="size-3.5" />
                        Edit
                      </DropdownMenuItem>
                    )}
                    {canDelete(c) && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <DropdownMenuItem
                            className="text-destructive"
                            onSelect={(e) => e.preventDefault()}
                          >
                            <Trash2 className="size-3.5" />
                            Delete
                          </DropdownMenuItem>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete comment?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Bu yorumu silmek istediğine emin misin? Bu işlem geri alınamaz. Yoruma
                              yapılmış yanıtlar yerinde kalır.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onDelete!(c.id)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </div>

        {isDeleted ? (
          <p className="mt-1 text-xs font-mono text-muted-foreground">deleted</p>
        ) : isEditing ? (
          <div className="mt-1 flex flex-col gap-2">
            <Textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  saveEdit();
                }
              }}
              rows={3}
              aria-label="Edit comment"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={saveEdit} disabled={!editBody.trim()}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={cancelEdit}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <MarkdownEditor value={c.body} editable={false} className="mt-1" />
        )}

        {/* Reply composer — one open at a time */}
        {replyTo === c.id && !isDeleted && !frozen && (
          <div className="mt-2 flex flex-col gap-2">
            <Textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submitReply();
                }
              }}
              rows={2}
              placeholder={`Reply to ${c.author}…`}
              aria-label="Reply composer"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={submitReply}
                disabled={!replyText.trim()}
              >
                Reply
              </Button>
              <Button size="sm" variant="ghost" onClick={closeReply}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Reaction row — hidden on tombstones */}
        {onReact && !isEditing && !isDeleted && !frozen && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {c.reactions?.map((r) => {
              const mine = hasReacted(c, r.emoji);
              return (
                <button
                  key={r.emoji}
                  type="button"
                  onClick={() => onReact(c.id, r.emoji)}
                  className={
                    'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs ' +
                    (mine
                      ? 'border-primary/40 bg-muted text-muted-foreground'
                      : 'border-border bg-muted text-muted-foreground')
                  }
                  aria-label={`${r.emoji} reaction, ${r.userIds.length} reactors`}
                >
                  <span>{r.emoji}</span>
                  <span className="font-mono">{r.userIds.length}</span>
                </button>
              );
            })}
            <Popover
              open={reactPickerFor === c.id}
              onOpenChange={(open) => setReactPickerFor(open ? c.id : null)}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 text-muted-foreground hover:text-foreground"
                  aria-label="Add reaction"
                >
                  <Smile className="size-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-1">
                <div className="grid grid-cols-7 gap-0.5">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onReact(c.id, emoji);
                        setReactPickerFor(null);
                      }}
                      className="rounded p-1 text-base hover:bg-muted"
                      aria-label={`React with ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}

        {!collapsed && replies.length > 0 && (
          <div className="mt-1 ml-4 border-l border-border pl-4">
            {replies.map((r) => renderNode(r, depth + 1, frozen))}
          </div>
        )}
      </div>
    );
  };

  return (
    <section id="comments" className="space-y-3">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <MessageSquare className="size-3.5" />
        Comments ({visibleCount})
      </h3>

      {/* Composer */}
      <div className="flex flex-col gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder="Add a comment…"
        />
        <div>
          <Button size="sm" variant="outline" onClick={submit} disabled={!text.trim()}>
            Submit comment
          </Button>
        </div>
      </div>

      {/* Comment list — threaded tree; roots newest-first, replies oldest-first (server-built) */}
      <div>
        {comments.map((c) => renderNode(c, 0))}
        {comments.length === 0 && (
          <p className="text-sm text-muted-foreground py-3">No comments yet.</p>
        )}
      </div>
    </section>
  );
}
