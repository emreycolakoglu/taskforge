import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, LayoutDashboard } from 'lucide-react'
import { api } from '@/hooks/api'
import { Board } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'

export function HomePage() {
  const [boards, setBoards] = useState<Board[]>([])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    api.boards.list().then(setBoards).catch(() => {})
  }, [])

  const handleCreate = async () => {
    if (!name.trim() || !slug.trim()) return
    const board = await api.boards.create({ name: name.trim(), slug: slug.trim() })
    setBoards([board, ...boards])
    setOpen(false)
    setName('')
    setSlug('')
    navigate(`/board/${board.id}`)
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await api.boards.delete(id)
    setBoards(boards.filter((b) => b.id !== id))
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Boards</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your task boards
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Board
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Board</DialogTitle>
              <DialogDescription>
                Create a new board with default lists (Backlog, To Do, In Progress, Review, Done).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Sprint 24"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Slug</label>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.replace(/[^a-z0-9-]/g, '').toLowerCase())}
                  placeholder="sprint-24"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate}>Create Board</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {boards.map((board) => (
          <Card
            key={board.id}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate(`/board/${board.id}`)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <LayoutDashboard className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">{board.name}</CardTitle>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={(e) => handleDelete(e, board.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>
                {board._count?.lists || 0} lists
                {board.description && ` · ${board.description}`}
              </CardDescription>
            </CardContent>
          </Card>
        ))}
        {boards.length === 0 && (
          <div className="col-span-full text-center py-12">
            <LayoutDashboard className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-sm text-muted-foreground">
              No boards yet. Create one to get started!
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
