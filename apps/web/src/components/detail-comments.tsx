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
 * of a tombstone keep rendering in place and remain fully interactive
 * (per-node permission gates apply). Header counts visible comments only.
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

import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Trash2,
  Pencil,
  Smile,
  Reply,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
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
import { Badge } from '@/components/ui/badge';
import { MarkdownEditor } from '@/components/markdown';
import { AttachmentChips } from '@/components/attachment-chips';
import { validateAttachmentFile, type AttachmentSettings } from '@/components/attachment-section';
import { useAuth } from '@/contexts/auth-context';
import { useSettings } from '@/hooks/use-settings';
import { useMembers } from '@/hooks/use-members';
import { useUserDirectory } from '@/hooks/use-users';
import { REACTION_EMOJIS } from '@/lib/reactions';
import type { Comment } from '@/types';

interface CommentUploadResult {
  commentId: string;
  failedFiles: File[];
}

interface DetailCommentsProps {
  comments: Comment[];
  onSubmit: (
    body: string,
    parentId?: string,
    files?: File[],
    commentId?: string,
  ) => Promise<CommentUploadResult | void> | void;
  onDelete?: (commentId: string) => void;
  onEdit?: (
    commentId: string,
    body: string,
    files?: File[],
    skipUpdate?: boolean,
  ) => Promise<CommentUploadResult | void> | void;
  onReact?: (commentId: string, emoji: string) => void;
  formatTimestamp: (ts: string) => string;
  boardId?: string;
  taskId?: string;
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
  boardId,
  taskId,
}: DetailCommentsProps) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submittedCommentId, setSubmittedCommentId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editFiles, setEditFiles] = useState<File[]>([]);
  const [editWasSaved, setEditWasSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [reactPickerFor, setReactPickerFor] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [replyCommentId, setReplyCommentId] = useState<string | null>(null);
  const [isReplying, setIsReplying] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(new Set());
  const submitInFlight = useRef(false);
  const replyInFlight = useRef(false);
  const saveInFlight = useRef(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: directory = [] } = useUserDirectory();
  const { data: settings } = useSettings();
  const { data: members } = useMembers(boardId ?? '');
  const attachmentSettings = settings as AttachmentSettings | undefined;
  const member = members?.find((item) => item.userId === user?.id);
  const canUpload =
    user?.role === 'admin' ||
    (members !== undefined &&
      (members.length === 0 || (member !== undefined && member.role !== 'viewer')));

  const addFiles = (
    selected: File[],
    setPendingFiles: (files: File[]) => void,
    pendingFiles: File[],
  ) => {
    const validFiles = selected.filter((file) => {
      const error = validateAttachmentFile(file, attachmentSettings);
      if (error) toast.error(error);
      return !error;
    });
    if (validFiles.length > 0) setPendingFiles([...pendingFiles, ...validFiles]);
  };

  const submit = () => {
    if (!text.trim() || submitInFlight.current) return;
    submitInFlight.current = true;
    setIsSubmitting(true);
    const submitted = submittedCommentId
      ? onSubmit(text.trim(), undefined, files, submittedCommentId)
      : files.length > 0
        ? onSubmit(text.trim(), undefined, files)
        : onSubmit(text.trim());
    const clear = () => {
      setText('');
      setFiles([]);
      setSubmittedCommentId(null);
    };
    const complete = (result: CommentUploadResult | void) => {
      if (result?.failedFiles?.length) {
        setFiles(result.failedFiles);
        setSubmittedCommentId(result.commentId);
      } else {
        clear();
      }
    };
    const finish = () => {
      submitInFlight.current = false;
      setIsSubmitting(false);
    };
    if (submitted && typeof submitted.then === 'function')
      void submitted
        .then(complete)
        .catch(() => {})
        .finally(finish);
    else {
      clear();
      finish();
    }
  };

  const visibleCount = useMemo(() => countVisible(comments), [comments]);

  const closeReply = (force = false) => {
    if (replyInFlight.current && !force) return;
    setReplyTo(null);
    setReplyText('');
    setReplyFiles([]);
    setReplyCommentId(null);
  };

  const submitReply = () => {
    if (!replyTo || !replyText.trim() || replyInFlight.current) return;
    replyInFlight.current = true;
    setIsReplying(true);
    const submitted = replyCommentId
      ? onSubmit(replyText.trim(), replyTo, replyFiles, replyCommentId)
      : replyFiles.length > 0
        ? onSubmit(replyText.trim(), replyTo, replyFiles)
        : onSubmit(replyText.trim(), replyTo);
    const complete = (result: CommentUploadResult | void) => {
      if (result?.failedFiles?.length) {
        setReplyFiles(result.failedFiles);
        setReplyCommentId(result.commentId);
      } else {
        closeReply(true);
      }
    };
    const finish = () => {
      replyInFlight.current = false;
      setIsReplying(false);
    };
    if (submitted && typeof submitted.then === 'function')
      void submitted
        .then(complete)
        .catch(() => {})
        .finally(finish);
    else {
      closeReply(true);
      finish();
    }
  };

  const openReply = (commentId: string) => {
    if (replyInFlight.current) return;
    setReplyTo((prev) => (prev === commentId ? null : commentId));
    setReplyText('');
    setReplyFiles([]);
    setReplyCommentId(null);
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
    if (saveInFlight.current) return;
    setEditingId(c.id);
    setEditBody(c.body);
    setEditFiles([]);
    setEditWasSaved(false);
  };

  const saveEdit = () => {
    if (!editingId || !editBody.trim() || saveInFlight.current) return;
    saveInFlight.current = true;
    setIsSaving(true);
    const submitted = editWasSaved
      ? onEdit!(editingId, editBody.trim(), editFiles, true)
      : editFiles.length > 0
        ? onEdit!(editingId, editBody.trim(), editFiles)
        : onEdit!(editingId, editBody.trim());
    const clear = () => {
      setEditingId(null);
      setEditBody('');
      setEditFiles([]);
      setEditWasSaved(false);
    };
    const complete = (result: CommentUploadResult | void) => {
      if (result?.failedFiles?.length) {
        setEditFiles(result.failedFiles);
        setEditWasSaved(true);
      } else {
        clear();
      }
    };
    const finish = () => {
      saveInFlight.current = false;
      setIsSaving(false);
    };
    if (submitted && typeof submitted.then === 'function')
      void submitted
        .then(complete)
        .catch(() => {})
        .finally(finish);
    else {
      clear();
      finish();
    }
  };

  const cancelEdit = () => {
    if (saveInFlight.current) return;
    setEditingId(null);
    setEditBody('');
    setEditFiles([]);
    setEditWasSaved(false);
  };

  const hasReacted = (c: Comment, emoji: string) =>
    !!user && !!c.reactions?.some((r) => r.emoji === emoji && r.userIds.includes(user.id));

  const renderNode = (c: Comment, depth: number) => {
    const isEditing = editingId === c.id;
    const isDeleted = !!c.deletedAt;
    const replies = c.replies ?? [];
    const collapsed = collapsedIds.has(c.id);
    const showMenu = canDelete(c) || canModify(c);

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
          {(showMenu || !isDeleted) && (
            <div className="ml-auto flex items-center gap-0.5">
              {!isDeleted && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 text-muted-foreground hover:text-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                  aria-label={`Reply to ${c.author}`}
                  onClick={() => openReply(c.id)}
                  disabled={isReplying}
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
                      <DropdownMenuItem onClick={() => startEdit(c)} disabled={isSaving}>
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
              disabled={isSaving || editWasSaved}
            />
            {canUpload && (
              <PendingFiles
                files={editFiles}
                inputId={`edit-comment-attachment-${c.id}`}
                label="Attach to edit"
                disabled={isSaving}
                onAdd={(selected) => addFiles(selected, setEditFiles, editFiles)}
                onRemove={(file) => setEditFiles(editFiles.filter((item) => item !== file))}
              />
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={saveEdit}
                disabled={!editBody.trim() || isSaving}
              >
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={isSaving}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <MarkdownEditor
            value={c.body}
            editable={false}
            className="mt-1"
            mentions={directory}
            onMentionClick={(userId) => navigate(`/tasks?assignee=${userId}`)}
          />
        )}

        {!isDeleted &&
          !isEditing &&
          c.attachments &&
          c.attachments.length > 0 &&
          boardId &&
          taskId && (
            <AttachmentChips
              attachments={c.attachments}
              subjectId={c.id}
              boardId={boardId}
              taskId={taskId}
            />
          )}

        {/* Reply composer — one open at a time */}
        {replyTo === c.id && !isDeleted && (
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
              disabled={isReplying || replyCommentId !== null}
            />
            {canUpload && (
              <PendingFiles
                files={replyFiles}
                inputId={`reply-comment-attachment-${c.id}`}
                label="Attach to reply"
                disabled={isReplying}
                onAdd={(selected) => addFiles(selected, setReplyFiles, replyFiles)}
                onRemove={(file) => setReplyFiles(replyFiles.filter((item) => item !== file))}
              />
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={submitReply}
                disabled={!replyText.trim() || isReplying}
              >
                Reply
              </Button>
              <Button size="sm" variant="ghost" onClick={() => closeReply()} disabled={isReplying}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Reaction row — hidden on tombstones */}
        {onReact && !isEditing && !isDeleted && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {c.reactions?.map((r) => {
              const mine = hasReacted(c, r.emoji);
              return (
                <Badge
                  key={r.emoji}
                  variant="outline"
                  asChild
                  className={
                    'cursor-pointer bg-muted ' +
                    (mine
                      ? 'border-foreground/40 text-foreground'
                      : 'border-border text-muted-foreground')
                  }
                  onClick={() => onReact(c.id, r.emoji)}
                >
                  <button
                    type="button"
                    aria-label={`${r.emoji} reaction, ${r.userIds.length} reactors`}
                  >
                    <span>{r.emoji}</span>
                    <span className="font-mono">{r.userIds.length}</span>
                  </button>
                </Badge>
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
            {replies.map((r) => renderNode(r, depth + 1))}
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
          disabled={isSubmitting || submittedCommentId !== null}
        />
        {canUpload && (
          <PendingFiles
            files={files}
            inputId="comment-attachment"
            label="Attach to comment"
            disabled={isSubmitting}
            onAdd={(selected) => addFiles(selected, setFiles, files)}
            onRemove={(file) => setFiles(files.filter((item) => item !== file))}
          />
        )}
        <div>
          <Button
            size="sm"
            variant="outline"
            onClick={submit}
            disabled={!text.trim() || isSubmitting}
          >
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

function PendingFiles({
  files,
  inputId,
  label = 'Attach to comment',
  disabled,
  onAdd,
  onRemove,
}: {
  files: File[];
  inputId: string;
  label?: string;
  disabled?: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        id={inputId}
        ref={inputRef}
        className="sr-only"
        type="file"
        multiple
        aria-label={`Choose file: ${label}`}
        disabled={disabled}
        onChange={(event) => {
          onAdd(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        aria-label={label}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip className="size-3.5" />
        Attach
      </Button>
      {files.map((file) => (
        <span
          key={`${file.name}-${file.lastModified}`}
          className="flex items-center gap-1 text-xs text-muted-foreground"
        >
          {file.name}
          <button
            type="button"
            aria-label={`Remove ${file.name}`}
            onClick={() => onRemove(file)}
            disabled={disabled}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
