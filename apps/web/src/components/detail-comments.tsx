/**
 * DetailComments — flat timeline comments + composer.
 *
 * Composer at top: Textarea (rows=2) + Submit (outline, NOT Lime — design.md:
 * detail page has no primary creation action). Enter submits, Shift+Enter
 * newline. Comment rows are flat (no card chrome) with border-b — Linear uses
 * a flat timeline, not cards.
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

import { useState } from 'react';
import { MessageSquare, MoreHorizontal, Trash2, Pencil, Smile } from 'lucide-react';
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
  onSubmit: (body: string) => void;
  onDelete?: (commentId: string) => void;
  onEdit?: (commentId: string, body: string) => void;
  onReact?: (commentId: string, emoji: string) => void;
  formatTimestamp: (ts: string) => string;
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
  const { user } = useAuth();

  const submit = () => {
    if (!text.trim()) return;
    onSubmit(text.trim());
    setText('');
  };

  const canModify = (c: Comment) => {
    if (!user || !onEdit) return false;
    if (!c.authorId) return user.role === 'admin';
    return c.authorId === user.id || user.role === 'admin';
  };

  const canDelete = (c: Comment) => {
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

  return (
    <section id="comments" className="space-y-3">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <MessageSquare className="size-3.5" />
        Comments ({comments.length})
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

      {/* Comment list — flat timeline */}
      <div>
        {comments.map((c) => {
          const isEditing = editingId === c.id;
          const showMenu = canDelete(c) || canModify(c);
          return (
            <div key={c.id} className="group py-3 border-b border-border last:border-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{c.author}</span>
                <span className="text-xs font-mono text-muted-foreground">
                  {formatTimestamp(c.createdAt)}
                </span>
                {c.editedAt && (
                  <span className="text-xs font-mono text-muted-foreground">(edited)</span>
                )}
                {showMenu && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 ml-auto text-muted-foreground hover:text-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
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
                                Bu yorumu silmek istediğine emin misin? Bu işlem geri alınamaz.
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

              {isEditing ? (
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
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={saveEdit}
                      disabled={!editBody.trim()}
                    >
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

              {/* Reaction row */}
              {onReact && !isEditing && (
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
            </div>
          );
        })}
        {comments.length === 0 && (
          <p className="text-sm text-muted-foreground py-3">No comments yet.</p>
        )}
      </div>
    </section>
  );
}
