/**
 * CreateTaskDialog — full create-issue dialog (Linear-style).
 *
 * Opened from the board header "New Issue" CTA. Fields: title (autofocus, Enter
 * submits), list (Select), priority (Select). The submit button is the Acid Lime
 * primary CTA — the modal is a focused conversion moment (design.md: a modal is
 * arguably a second screen, so Lime is permitted here).
 */

import { useState, useEffect } from 'react'
import type { List, Task } from '@/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'

interface CreateTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lists: List[]
  defaultListId?: string
  onSubmit: (data: { title: string; listId: string; priority: Task['priority'] }) => void
}

const PRIORITIES: { value: Task['priority']; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

export function CreateTaskDialog({
  open,
  onOpenChange,
  lists,
  defaultListId,
  onSubmit,
}: CreateTaskDialogProps) {
  const [title, setTitle] = useState('')
  const [listId, setListId] = useState(defaultListId ?? lists[0]?.id ?? '')
  const [priority, setPriority] = useState<Task['priority']>('medium')

  useEffect(() => {
    if (open) {
      setTitle('')
      setListId(defaultListId ?? lists[0]?.id ?? '')
      setPriority('medium')
    }
  }, [open, defaultListId, lists])

  const handleSubmit = () => {
    if (!title.trim() || !listId) return
    onSubmit({ title: title.trim(), listId, priority })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New issue</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit() } }}
            placeholder="Issue title..."
          />
          <div className="flex gap-2">
            <Select value={listId} onValueChange={setListId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="List" />
              </SelectTrigger>
              <SelectContent>
                {lists.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priority} onValueChange={(v) => setPriority(v as Task['priority'])}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit}>Create issue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}