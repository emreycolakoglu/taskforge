import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useBoardFull } from '@/hooks/use-boards'
import { useLabels, useCreateLabel, useUpdateLabel, useDeleteLabel } from '@/hooks/use-labels'
import { api } from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label as UILabel } from '@/components/ui/label'
import { Card, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ColorPicker } from '@/components/color-picker'
import { EmojiPicker } from '@/components/emoji-picker'
import { ProgressIcon } from '@/components/progress-icon'
import type { Label, Status } from '@/types'

export function BoardSettingsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: board, isLoading: boardLoading } = useBoardFull(id!)
  const { data: labels = [], isLoading: labelsLoading } = useLabels(id!)

  if (boardLoading || labelsLoading) {
    return (
      <div className="p-6">
        <Skeleton className="h-6 w-40 mb-2" />
        <Skeleton className="h-4 w-60" />
      </div>
    )
  }

  if (!board) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>Board not found.</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <header className="shrink-0 bg-secondary border-b border-border px-6 py-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" aria-label="Back to board" onClick={() => navigate(`/board/${id}`)}>
          <ArrowLeft className="size-5" />
        </Button>
        <div>
          <h1 className="text-lg font-medium tracking-tight text-foreground">{board.name}</h1>
          <p className="text-sm text-muted-foreground">Board settings</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-background p-6">
        <div className="space-y-6">
          <BoardInfoSection boardId={id!} boardName={board.name} boardIcon={board.icon ?? '⭐'} />
          <StatusesSection boardId={id!} statuses={board.statuses ?? []} />
          <LabelsSection boardId={id!} labels={labels} />
        </div>
      </div>
    </div>
  )
}

function BoardInfoSection({ boardId, boardName, boardIcon }: { boardId: string; boardName: string; boardIcon: string }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(boardName)
  const [icon, setIcon] = useState(boardIcon)

  const handleIconChange = async (newIcon: string) => {
    setIcon(newIcon)
    try {
      await api.boards.update(boardId, { icon: newIcon })
      queryClient.invalidateQueries({ queryKey: ['boards', boardId, 'full'] })
      queryClient.invalidateQueries({ queryKey: ['boards'] })
      toast.success('Board icon updated')
    } catch (err) {
      toast.error('Failed to update icon', { description: err instanceof Error ? err.message : undefined })
      setIcon(boardIcon)
    }
  }

  const handleNameBlur = async () => {
    if (name.trim() === boardName) return
    try {
      await api.boards.update(boardId, { name: name.trim() })
      queryClient.invalidateQueries({ queryKey: ['boards', boardId, 'full'] })
      queryClient.invalidateQueries({ queryKey: ['boards'] })
      toast.success('Board name updated')
    } catch (err) {
      toast.error('Failed to update name', { description: err instanceof Error ? err.message : undefined })
      setName(boardName)
    }
  }

  return (
    <Card className="p-6 space-y-4">
      <div>
        <CardTitle className="text-base text-foreground">Board Info</CardTitle>
        <CardDescription className="text-sm text-muted-foreground mt-1">
          Change the board's emoji icon and name. Saved instantly.
        </CardDescription>
      </div>
      <div className="flex items-center gap-3">
        <EmojiPicker value={icon} onChange={handleIconChange} className="size-10 text-xl border border-border" />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameBlur}
          className="flex-1"
          aria-label="Board name"
        />
      </div>
    </Card>
  )
}

function StatusesSection({ boardId, statuses }: { boardId: string; statuses: Status[] }) {
  const queryClient = useQueryClient()
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [progressUpdating, setProgressUpdating] = useState<string | null>(null)

  const handleToggleDone = async (status: Status) => {
    setTogglingId(status.id)
    try {
      if (status.isDone) {
        await api.statuses.unsetDone(boardId)
      } else {
        await api.statuses.toggleDone(status.id)
      }
      toast.success('Done status updated')
      queryClient.invalidateQueries({ queryKey: ['boards', boardId, 'full'] })
    } catch (err) {
      toast.error('Failed to update done status', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setTogglingId(null)
    }
  }

  const handleProgressChange = async (statusId: string, value: string) => {
    const num = parseInt(value, 10)
    if (isNaN(num) || num < 0 || num > 100) return
    setProgressUpdating(statusId)
    try {
      await api.statuses.update(statusId, { progress: num })
      queryClient.invalidateQueries({ queryKey: ['boards', boardId, 'full'] })
    } catch (err) {
      toast.error('Failed to update progress', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setProgressUpdating(null)
    }
  }

  return (
    <Card className="p-6 space-y-4">
      <div>
        <CardTitle className="text-base text-foreground">Statuses</CardTitle>
        <CardDescription className="text-sm text-muted-foreground mt-1">
          Manage statuses for this board. Mark one status as Done to auto-stamp completed tasks.
        </CardDescription>
      </div>
      <div className="flex flex-col">
        {statuses.map((status) => (
          <div
            key={status.id}
            className="flex items-center justify-between py-3 border-b border-border last:border-0"
          >
            <div className="flex items-center gap-3">
              <ProgressIcon progress={status.progress ?? 0} size={16} />
              <span className="text-sm text-foreground">{status.name}</span>
              {status.isDone && (
                <Badge variant="secondary" className="text-xs text-muted-foreground bg-muted rounded-sm px-1.5 py-0.5 border-0">
                  Done
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <label htmlFor={`progress-${status.id}`} className="text-xs text-muted-foreground">
                  Progress
                </label>
                <input
                  id={`progress-${status.id}`}
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={status.progress ?? 0}
                  disabled={progressUpdating === status.id}
                  onBlur={(e) => handleProgressChange(status.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleProgressChange(status.id, (e.target as HTMLInputElement).value)
                    }
                  }}
                  className="w-16 h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <UILabel htmlFor={`done-${status.id}`} className="text-xs text-muted-foreground">
                  Done
                </UILabel>
                <Switch
                  id={`done-${status.id}`}
                  checked={!!status.isDone}
                  disabled={togglingId === status.id}
                  onCheckedChange={() => handleToggleDone(status)}
                />
              </div>
            </div>
          </div>
        ))}
        {statuses.length === 0 && (
          <p className="text-sm text-muted-foreground py-3">No statuses yet</p>
        )}
      </div>
    </Card>
  )
}

function LabelsSection({ boardId, labels }: { boardId: string; labels: Label[] }) {
  const createLabel = useCreateLabel()

  const handleCreate = (name: string, color: string) => {
    createLabel.mutate({ boardId, name, color })
  }

  return (
    <Card className="p-6 space-y-4">
      <div>
        <CardTitle className="text-base text-foreground">Labels</CardTitle>
        <CardDescription className="text-sm text-muted-foreground mt-1">Manage labels for this board</CardDescription>
      </div>
      <div className="flex flex-col">
        {labels.map((label) => (
          <LabelRow key={label.id} label={label} boardId={boardId} />
        ))}
        {labels.length === 0 && (
          <p className="text-sm text-muted-foreground py-3">No labels yet</p>
        )}
      </div>
      <div className="pt-4 border-t border-border">
        <AddLabelForm boardId={boardId} onSubmit={handleCreate} />
      </div>
    </Card>
  )
}

function LabelRow({ label, boardId }: { label: Label; boardId: string }) {
  const [editing, setEditing] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const updateLabel = useUpdateLabel()
  const deleteLabel = useDeleteLabel()

  const handleUpdate = (name: string, color: string) => {
    updateLabel.mutate(
      { id: label.id, boardId, data: { name, color } },
      { onSuccess: () => setEditing(false) },
    )
  }

  const handleDelete = () => {
    deleteLabel.mutate({ id: label.id, boardId }, { onSuccess: () => setDeleteOpen(false) })
  }

  if (editing) {
    return (
      <LabelEditForm
        initialName={label.name}
        initialColor={label.color}
        onSave={handleUpdate}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <>
      <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
        <div className="flex items-center gap-3">
          <div
            className="w-4 h-4 rounded-sm shrink-0"
            style={{ backgroundColor: label.color }}
          />
          <span className="text-sm text-foreground">{label.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" aria-label={`Edit ${label.name}`} onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" aria-label={`Delete ${label.name}`} onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete label</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{label.name}</strong>? This will remove it from all tasks.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLabel.isPending}>
              {deleteLabel.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function LabelEditForm({
  initialName,
  initialColor,
  onSave,
  onCancel,
}: {
  initialName: string
  initialColor: string
  onSave: (name: string, color: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initialName)
  const [color, setColor] = useState(initialColor)

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
      <div className="flex flex-col gap-2">
        <UILabel htmlFor={`edit-name-${initialName}`}>Name</UILabel>
        <Input
          id={`edit-name-${initialName}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Label name"
        />
      </div>
      <div className="flex flex-col gap-2">
        <UILabel>Color</UILabel>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => name.trim() && onSave(name.trim(), color)} disabled={!name.trim()}>
          <Check className="size-4" />
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          <X className="size-4" />
          Cancel
        </Button>
      </div>
    </div>
  )
}

function AddLabelForm({ boardId, onSubmit }: { boardId: string; onSubmit: (name: string, color: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6366f1')
  const createLabel = useCreateLabel()

  const handleSubmit = () => {
    if (!name.trim()) return
    createLabel.mutate(
      { boardId, name: name.trim(), color },
      {
        onSuccess: () => {
          setName('')
          setColor('#6366f1')
          setOpen(false)
        },
      },
    )
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Add Label
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
      <div className="flex flex-col gap-2">
        <UILabel htmlFor="new-label-name">Name</UILabel>
        <Input
          id="new-label-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="Label name"
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-2">
        <UILabel>Color</UILabel>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSubmit} disabled={!name.trim() || createLabel.isPending}>
          {createLabel.isPending ? 'Adding…' : 'Add Label'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}