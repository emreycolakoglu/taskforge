/**
 * DetailComments — flat timeline comments + composer.
 *
 * Composer at top: Textarea (rows=2) + Submit (outline, NOT Lime — design.md:
 * detail page has no primary creation action). Enter submits, Shift+Enter
 * newline. Comment rows are flat (no card chrome) with border-b — Linear uses
 * a flat timeline, not cards.
 *
 * Delete: three-dot menu appears on the user's own comments (or any comment
 * if admin). Desktop: hover-revealed. Mobile: always visible. Confirmation
 * via AlertDialog — "Bu yorumu silmek istediğine emin misin?" — no preview.
 */

import { useState } from 'react'
import { MessageSquare, MoreHorizontal, Trash2 } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
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
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/contexts/auth-context'
import type { Comment } from '@/types'

interface DetailCommentsProps {
  comments: Comment[]
  onSubmit: (body: string) => void
  onDelete?: (commentId: string) => void
  formatTimestamp: (ts: string) => string
}

export function DetailComments({ comments, onSubmit, onDelete, formatTimestamp }: DetailCommentsProps) {
  const [text, setText] = useState('')
  const { user } = useAuth()

  const submit = () => {
    if (!text.trim()) return
    onSubmit(text.trim())
    setText('')
  }

  const canDelete = (c: Comment) => {
    if (!user || !onDelete) return false
    // Anonymous comment (authorId null) — only admin
    if (!c.authorId) return user.role === 'admin'
    return c.authorId === user.id || user.role === 'admin'
  }

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
              e.preventDefault()
              submit()
            }
          }}
          rows={2}
          placeholder="Add a comment…"
        />
        <div>
          <Button
            size="sm"
            variant="outline"
            onClick={submit}
            disabled={!text.trim()}
          >
            Submit comment
          </Button>
        </div>
      </div>

      {/* Comment list — flat timeline */}
      <div>
        {comments.map((c) => (
          <div key={c.id} className="group py-3 border-b border-border last:border-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">{c.author}</span>
              <span className="text-xs font-mono text-muted-foreground">
                {formatTimestamp(c.createdAt)}
              </span>
              {canDelete(c) && (
                <AlertDialog>
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
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem className="text-destructive">
                          <Trash2 className="size-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete comment?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Bu yorumu silmek istediğine emin misin? Bu işlem geri alınamaz.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => onDelete!(c.id)}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
            <p className="text-sm text-foreground/90 mt-1">{c.body}</p>
          </div>
        ))}
        {comments.length === 0 && (
          <p className="text-sm text-muted-foreground py-3">No comments yet.</p>
        )}
      </div>
    </section>
  )
}