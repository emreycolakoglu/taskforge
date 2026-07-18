/**
 * QuickAddInput — inline single-line quick-add input (NOT a modal/dialog).
 *
 * Used in the column footer (+ New issue) and the sub-task list. Submits on
 * Enter, cancels on blur/Escape. No Add/Cancel buttons — the fast path.
 */

import { useState } from 'react'
import { Input } from '@/components/ui/input'

interface QuickAddInputProps {
  statusId: string
  onSubmit: (title: string) => void
  onClose: () => void
  parentId?: string
  parentTaskNumber?: string
}

export function QuickAddInput({ onSubmit, onClose, parentId, parentTaskNumber }: QuickAddInputProps) {
  const [title, setTitle] = useState('')

  const handleSubmit = () => {
    if (!title.trim()) return
    onSubmit(title.trim())
  }

  return (
    <div className="py-1">
      {parentId && parentTaskNumber && (
        <p className="text-xs text-muted-foreground mb-1 px-1">
          Sub-task of <span className="font-mono">{parentTaskNumber}</span>
        </p>
      )}
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); handleSubmit() }
          if (e.key === 'Escape') { e.preventDefault(); onClose() }
        }}
        onBlur={onClose}
        placeholder="Task title..."
        className="h-7 text-sm"
      />
    </div>
  )
}