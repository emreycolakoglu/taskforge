/**
 * CreateTaskDialog — full create-issue dialog (Linear-style).
 *
 * Opened from the board header "New Issue" CTA. Fields: title (autofocus, Enter
 * submits), description (Textarea), status (Select), priority (Select), assignee
 * (Select with avatar initial, reuses the DetailAssigneeSelect visual). The submit button is the Acid Lime
 * primary CTA — the modal is a focused conversion moment (design.md: a modal is
 * arguably a second screen, so Lime is permitted here).
 */

import { useState, useEffect } from 'react'
import type { Status, Task, User } from '@/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

interface CreateTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  statuses: Status[]
  users: User[]
  defaultStatusId?: string
  onSubmit: (data: { title: string; description?: string; statusId: string; priority: Task['priority']; assigneeId?: string | null }) => void
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
  statuses,
  users,
  defaultStatusId,
  onSubmit,
}: CreateTaskDialogProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [statusId, setStatusId] = useState(defaultStatusId ?? statuses[0]?.id ?? '')
  const [priority, setPriority] = useState<Task['priority']>('medium')
  const [assigneeId, setAssigneeId] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTitle('')
      setDescription('')
      setStatusId(defaultStatusId ?? statuses[0]?.id ?? '')
      setPriority('medium')
      setAssigneeId(null)
    }
  }, [open, defaultStatusId, statuses])

  const handleSubmit = () => {
    if (!title.trim() || !statusId) return
    onSubmit({
      title: title.trim(),
      description: description.trim() ? description.trim() : undefined,
      statusId,
      priority,
      assigneeId,
    })
    onOpenChange(false)
  }

  const selectedUser = users.find((u) => u.id === assigneeId) ?? null

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
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add description..."
            rows={3}
          />
          <div className="flex gap-2">
            <Select value={statusId} onValueChange={setStatusId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
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
          <Select
            value={assigneeId ?? '__none__'}
            onValueChange={(v) => setAssigneeId(v === '__none__' ? null : v)}
          >
            <SelectTrigger className="flex-1">
              <Avatar className="size-5 border-0">
                <AvatarFallback className="text-[9px] font-semibold bg-muted text-muted-foreground">
                  {selectedUser
                    ? selectedUser.displayName.charAt(0).toUpperCase()
                    : '+'}
                </AvatarFallback>
              </Avatar>
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Unassigned</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  <span className="flex items-center gap-1.5">
                    <Avatar className="size-5 border-0">
                      <AvatarFallback className="text-[9px] font-semibold bg-muted text-muted-foreground">
                        {u.displayName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {u.displayName}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit}>Create issue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}