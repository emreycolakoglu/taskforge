/**
 * DetailComments — flat timeline comments + composer.
 *
 * Composer at top: Textarea (rows=2) + Submit (outline, NOT Lime — design.md:
 * detail page has no primary creation action). Enter submits, Shift+Enter
 * newline. Comment rows are flat (no card chrome) with border-b — Linear uses
 * a flat timeline, not cards.
 */

import { useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import type { Comment } from '@/types'

interface DetailCommentsProps {
  comments: Comment[]
  onSubmit: (body: string) => void
  formatTimestamp: (ts: string) => string
}

export function DetailComments({ comments, onSubmit, formatTimestamp }: DetailCommentsProps) {
  const [text, setText] = useState('')

  const submit = () => {
    if (!text.trim()) return
    onSubmit(text.trim())
    setText('')
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
          <div key={c.id} className="py-3 border-b border-border last:border-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">{c.author}</span>
              <span className="text-xs font-mono text-muted-foreground">
                {formatTimestamp(c.createdAt)}
              </span>
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