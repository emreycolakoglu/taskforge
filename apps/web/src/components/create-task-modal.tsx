import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface CreateTaskModalProps {
  listId: string
  onSubmit: (title: string) => void
  onClose: () => void
}

export function CreateTaskModal({ listId, onSubmit, onClose }: CreateTaskModalProps) {
  const [title, setTitle] = useState('')

  const handleSubmit = () => {
    if (!title.trim()) return
    onSubmit(title.trim())
  }

  return (
    <div className="bg-card border border-border rounded-md p-3 space-y-2">
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        placeholder="Task title..."
        className="bg-input text-foreground text-sm rounded-md px-2 py-1.5 placeholder:text-muted-foreground/70 border border-border focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex gap-2">
        <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 text-sm h-8 px-3 rounded-md" onClick={handleSubmit}>Add</Button>
        <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground text-sm h-8 px-3 rounded-md" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  )
}
