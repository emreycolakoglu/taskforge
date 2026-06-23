/**
 * DetailDescriptionEditor — inline editable description region.
 *
 * No "Description" heading (Linear doesn't have one). Display mode is a plain
 * editable region with a placeholder. Edit mode is a Textarea + Save/Cancel
 * action row. No Lime CTA — Save is outline (design.md: detail page has no
 * primary creation action).
 */

import { useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

interface DetailDescriptionEditorProps {
  value: string
  onSave: (value: string) => void
}

export function DetailDescriptionEditor({ value, onSave }: DetailDescriptionEditorProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (!editing) {
    return (
      <div
        className="text-sm text-foreground/90 leading-relaxed min-h-[60px] cursor-text hover:bg-accent/30 rounded-md -mx-2 px-2 py-1"
        onClick={() => {
          setDraft(value)
          setEditing(true)
        }}
      >
        {value || (
          <span className="italic text-muted-foreground">Add a description…</span>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={8}
        placeholder="Add a description…"
      />
      <div className="flex gap-2 mt-2">
        <Button size="sm" variant="outline" onClick={() => { onSave(draft); setEditing(false) }}>
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => { setDraft(value); setEditing(false) }}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}