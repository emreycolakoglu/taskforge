import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, LayoutDashboard } from 'lucide-react'
import { useBoards, useCreateBoard, useDeleteBoard } from '@/hooks/use-boards'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

export function HomePage() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const navigate = useNavigate()

  const { data: boards = [] } = useBoards()
  const createBoard = useCreateBoard()
  const deleteBoard = useDeleteBoard()

  const handleCreate = () => {
    if (!name.trim()) return
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    createBoard.mutate(
      { name: name.trim(), slug },
      {
        onSuccess: (board) => {
          setOpen(false)
          setName('')
          navigate(`/board/${board.id}`)
        },
      },
    )
  }

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    deleteBoard.mutate(id)
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
              <Plus data-icon="inline-start" />
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
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="board-name">Name</Label>
                <Input
                  id="board-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Sprint 24"
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
            className="cursor-pointer hover:shadow-md motion-reduce:transition-none transition-shadow"
            onClick={() => navigate(`/board/${board.id}`)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <LayoutDashboard className="size-5 text-muted-foreground" />
                  <CardTitle className="text-base">{board.name}</CardTitle>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete ${board.name}`}
                  onClick={(e) => handleDelete(e, board.id)}
                >
                  <Trash2 className="size-4" />
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
          <div className="col-span-full flex flex-col items-center gap-2 py-12">
            <LayoutDashboard className="size-12 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No boards yet. Create one to get started!
            </p>
          </div>
        )}
      </div>
    </div>
  )
}