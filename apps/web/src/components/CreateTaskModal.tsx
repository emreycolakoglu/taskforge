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
    <div className="space-y-2">
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        placeholder="Task title..."
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSubmit}>Add</Button>
        <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  )
}
