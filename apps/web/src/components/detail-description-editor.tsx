/**
 * DetailDescriptionEditor — always-live markdown description on the task detail.
 *
 * No "Description" heading (Linear doesn't have one). The editor is always
 * mounted and editable; there is no Save/Cancel row. Edits autosave: debounced
 * ~1s after typing stops, and flushed immediately on blur so nothing is lost.
 * A save is skipped when the serialized markdown matches the server value, so
 * focus-in/out without edits does not spawn a mutation.
 *
 * The MarkdownEditor's remote-update guard keeps live WebSocket refetches from
 * clobbering the caret mid-edit (last-write-wins on the field).
 */

import { useEffect, useRef } from 'react'
import { MarkdownEditor } from '@/components/markdown'
import { createAutosaver, type Autosaver } from '@/lib/autosave'

const AUTOSAVE_DELAY_MS = 1000

interface DetailDescriptionEditorProps {
  value: string
  onSave: (value: string) => void
}

export function DetailDescriptionEditor({ value, onSave }: DetailDescriptionEditorProps) {
  const onSaveRef = useRef(onSave)
  const valueRef = useRef(value)
  onSaveRef.current = onSave
  valueRef.current = value

  const saverRef = useRef<Autosaver<string> | null>(null)
  if (saverRef.current === null) {
    saverRef.current = createAutosaver<string>(
      (markdown) => {
        if (markdown !== valueRef.current) onSaveRef.current(markdown)
      },
      { delayMs: AUTOSAVE_DELAY_MS },
    )
  }

  // Flush any pending edit if the view unmounts (navigation away mid-edit).
  useEffect(() => () => saverRef.current?.flush(), [])

  return (
    <MarkdownEditor
      value={value}
      onChange={(markdown) => saverRef.current?.schedule(markdown)}
      onBlur={(markdown) => {
        saverRef.current?.schedule(markdown)
        saverRef.current?.flush()
      }}
    />
  )
}
