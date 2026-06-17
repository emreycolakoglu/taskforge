import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { ArrowLeft, Plus, X, List, Columns3 } from 'lucide-react'
import { api } from '@/hooks/api'
import { useSocket } from '@/hooks/useSocket'
import { Board, List as ListType, Task, Label } from '@/types'
import { TaskCard } from './TaskCard'
import { TaskDetail } from './TaskDetail'
import { CreateTaskModal } from './CreateTaskModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

export function KanbanBoard() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [board, setBoard] = useState<Board | null>(null)
  const [lists, setLists] = useState<ListType[]>([])
  const [labels, setLabels] = useState<Label[]>([])
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [creatingInList, setCreatingInList] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')

  const loadBoard = useCallback(async () => {
    if (!id) return
    const full = await api.boards.getFull(id)
    setBoard(full)
    setLists(full.lists || [])
    setLabels(full.labels || [])
  }, [id])

  useEffect(() => { loadBoard() }, [loadBoard])

  const socket = useSocket(id)
  useEffect(() => {
    const unsub1 = socket.on('task:created', loadBoard)
    const unsub2 = socket.on('task:updated', loadBoard)
    const unsub3 = socket.on('task:moved', loadBoard)
    const unsub4 = socket.on('list:created', loadBoard)
    const unsub5 = socket.on('list:updated', loadBoard)
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5() }
  }, [socket, loadBoard])

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return
    const { draggableId, source, destination } = result

    if (source.droppableId === destination.droppableId) {
      const list = lists.find((l) => l.id === source.droppableId)
      if (!list?.tasks) return
      const reordered = [...list.tasks]
      const [moved] = reordered.splice(source.index, 1)
      reordered.splice(destination.index, 0, moved)
      const items = reordered.map((t, i) => ({ id: t.id, position: i }))
      await api.tasks.reorder(items)
    } else {
      const targetList = lists.find((l) => l.id === destination.droppableId)
      const targetTasks = targetList?.tasks || []
      const position = destination.index < targetTasks.length
        ? targetTasks[destination.index].position
        : (targetTasks.length > 0 ? targetTasks[targetTasks.length - 1].position + 1 : 0)
      await api.tasks.move(draggableId, { listId: destination.droppableId, position })
    }
  }

  const handleCreateTask = async (listId: string, title: string) => {
    await api.tasks.create({ listId, title })
    setCreatingInList(null)
  }

  async function handleDeleteList(listId: string) {
    await api.lists.delete(listId)
    loadBoard()
  }

  const priorityColor = (p: string) => {
    switch (p) {
      case 'urgent': return 'text-red-500'
      case 'high': return 'text-orange-500'
      case 'medium': return 'text-indigo-500'
      default: return 'text-muted-foreground'
    }
  }

  if (!board) return null

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">{board.name}</h1>
            <p className="text-xs text-muted-foreground">{board.description}</p>
          </div>
          <div className="flex gap-1 ml-4">
            {labels.map((l) => (
              <Badge key={l.id} style={{ backgroundColor: l.color }} className="text-white text-[10px] px-1.5 py-0">
                {l.name}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4 mr-1" />
            List
          </Button>
          <Button
            variant={viewMode === 'kanban' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('kanban')}
          >
            <Columns3 className="h-4 w-4 mr-1" />
            Kanban
          </Button>
        </div>
      </header>

      {/* Content */}
      {viewMode === 'list' ? (
        <div className="p-6 overflow-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2 px-3">Task</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2 px-3">List</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2 px-3">Priority</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2 px-3">Assignee</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2 px-3">Due</th>
              </tr>
            </thead>
            <tbody>
              {lists.flatMap((l) =>
                (l.tasks || []).map((t) => (
                  <tr
                    key={t.id}
                    className="border-b hover:bg-muted/50 cursor-pointer"
                    onClick={() => setSelectedTask(t)}
                  >
                    <td className="py-2.5 px-3 text-sm font-medium">{t.title}</td>
                    <td className="py-2.5 px-3 text-sm text-muted-foreground">{l.name}</td>
                    <td className="py-2.5 px-3 text-sm">
                      <span className={cn("font-semibold text-xs", priorityColor(t.priority))}>
                        {t.priority}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-sm text-muted-foreground">{t.assignee || '—'}</td>
                    <td className="py-2.5 px-3 text-sm text-muted-foreground">
                      {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <ScrollArea className="flex-1 p-4">
            <div className="flex gap-4 h-full min-h-0">
              {lists.map((list) => (
                <Droppable key={list.id} droppableId={list.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn(
                        "flex flex-col w-72 shrink-0 rounded-lg border bg-card",
                        snapshot.isDraggingOver && "bg-accent/50"
                      )}
                    >
                      {/* List header */}
                      <div className="flex items-center justify-between px-3 py-2.5 border-b">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: list.color || '#6366f1' }}
                          />
                          <span className="text-sm font-semibold">{list.name}</span>
                          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                            {list.tasks?.length || 0}
                          </span>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setCreatingInList(list.id)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteList(list.id)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Tasks */}
                      <div className="flex-1 p-2 space-y-2 min-h-[60px]">
                        {(list.tasks || []).map((task, index) => (
                          <Draggable key={task.id} draggableId={task.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                onClick={() => setSelectedTask(task)}
                              >
                                <TaskCard task={task} isDragging={snapshot.isDragging} />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>

                      {/* Inline create */}
                      {creatingInList === list.id && (
                        <div className="p-2 border-t">
                          <CreateTaskModal
                            listId={list.id}
                            onSubmit={(title) => handleCreateTask(list.id, title)}
                            onClose={() => setCreatingInList(null)}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </Droppable>
              ))}

              {/* Add list */}
              <div className="w-72 shrink-0">
                <AddListForm boardId={board.id} onCreated={loadBoard} />
              </div>
            </div>
          </ScrollArea>
        </DragDropContext>
      )}

      {/* Task detail modal */}
      {selectedTask && (
        <TaskDetail task={selectedTask} onClose={() => setSelectedTask(null)} onUpdate={loadBoard} />
      )}
    </div>
  )
}

function AddListForm({ boardId, onCreated }: { boardId: string; onCreated: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')

  const handleSubmit = async () => {
    if (!name.trim()) return
    await api.lists.create({ boardId, name: name.trim() })
    setName('')
    setEditing(false)
    onCreated()
  }

  if (editing) {
    return (
      <div className="rounded-lg border bg-card p-3 space-y-2">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="List name..."
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSubmit}>Add</Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </div>
    )
  }

  return (
    <Button
      variant="outline"
      className="w-full border-dashed text-muted-foreground"
      onClick={() => setEditing(true)}
    >
      <Plus className="h-4 w-4 mr-2" />
      Add List
    </Button>
  )
}
