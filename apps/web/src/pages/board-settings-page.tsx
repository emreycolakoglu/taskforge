import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import { useBoard } from '@/hooks/use-boards'
import { useLabels, useCreateLabel, useUpdateLabel, useDeleteLabel } from '@/hooks/use-labels'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label as UILabel } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ColorPicker } from '@/components/color-picker'
import type { Label } from '@/types'

export function BoardSettingsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: board, isLoading: boardLoading } = useBoard(id!)
  const { data: labels = [], isLoading: labelsLoading } = useLabels(id!)

  if (boardLoading || labelsLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="h-6 w-40 animate-pulse rounded bg-muted mb-2" />
        <div className="h-4 w-60 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (!board) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <p className="text-destructive">Board not found.</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" aria-label="Back to board" onClick={() => navigate(`/board/${id}`)}>
          <ArrowLeft className="size-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{board.name}</h1>
          <p className="text-sm text-muted-foreground">Board settings</p>
        </div>
      </div>

      <LabelsSection boardId={id!} labels={labels} />
    </div>
  )
}

function LabelsSection({ boardId, labels }: { boardId: string; labels: Label[] }) {
  const createLabel = useCreateLabel()

  const handleCreate = (name: string, color: string) => {
    createLabel.mutate({ boardId, name, color })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Labels</CardTitle>
        <CardDescription>Manage labels for this board</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          {labels.map((label) => (
            <LabelRow key={label.id} label={label} boardId={boardId} />
          ))}
          {labels.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">No labels yet</p>
          )}
        </div>
        <div className="mt-4 pt-4 border-t">
          <AddLabelForm boardId={boardId} onSubmit={handleCreate} />
        </div>
      </CardContent>
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
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="flex items-center gap-3">
          <div
            className="size-4 rounded-full shrink-0"
            style={{ backgroundColor: label.color }}
          />
          <span className="text-sm font-medium">{label.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Edit ${label.name}`} onClick={() => setEditing(true)}>
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
    <div className="flex flex-col gap-3 rounded-lg border p-3">
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
    <div className="flex flex-col gap-3 rounded-lg border p-3">
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