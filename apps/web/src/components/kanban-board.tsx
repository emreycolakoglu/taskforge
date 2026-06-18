import { useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { ArrowLeft, Plus, X, List, Columns3, Settings, SlidersHorizontal } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/hooks/api'
import { useBoardFull } from '@/hooks/use-boards'
import { useCreateTask } from '@/hooks/use-tasks'
import { useSocket } from '@/hooks/use-socket'
import { Task, Label } from '@/types'
import { TaskCard } from './task-card'
import { TaskDetail } from './task-detail'
import { CreateTaskModal } from './create-task-modal'
import { LabelPill } from './label-pill'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

export function KanbanBoard() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: board } = useBoardFull(id!)
  const lists = board?.lists || []
  const labels: Label[] = board?.labels || []

  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [creatingInList, setCreatingInList] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')
  const [activeLabelIds, setActiveLabelIds] = useState<string[]>([])

  const createTask = useCreateTask()

  // WebSocket handles cache invalidation via useSocket
  useSocket(id)

  const handleDragEnd = useCallback(async (result: DropResult) => {
    if (!result.destination || !id) return
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
    // Invalidate after reorder/move so the UI refreshes
    queryClient.invalidateQueries({ queryKey: ['boards', id, 'full'] })
  }, [id, lists, queryClient])

  const handleCreateTask = (listId: string, title: string) => {
    if (!id) return
    createTask.mutate(
      { listId, title, boardId: id },
      { onSuccess: () => setCreatingInList(null) },
    )
  }

  async function handleDeleteList(listId: string) {
    await api.lists.delete(listId)
    queryClient.invalidateQueries({ queryKey: ['boards', id!, 'full'] })
  }

  const toggleLabelFilter = (labelId: string) => {
    setActiveLabelIds((prev) =>
      prev.includes(labelId)
        ? prev.filter((id) => id !== labelId)
        : [...prev, labelId]
    )
  }

  const clearFilters = () => setActiveLabelIds([])

  /** Filter tasks: show only tasks that have ALL active labels. */
  const filterTask = useCallback((task: Task) => {
    if (activeLabelIds.length === 0) return true
    const taskLabelIds = (task.taskLabels ?? task.labels ?? []).map((tl) => tl.labelId)
    return activeLabelIds.every((id) => taskLabelIds.includes(id))
  }, [activeLabelIds])

  const filteredLists = useMemo(() => {
    return lists.map((list) => ({
      ...list,
      tasks: (list.tasks || []).filter(filterTask),
    }))
  }, [lists, filterTask])

  const priorityColor = (p: string) => {
    switch (p) {
      case 'urgent': return 'text-destructive'
      case 'high': return 'text-orange-600 dark:text-orange-400'
      case 'medium': return 'text-indigo-600 dark:text-indigo-400'
      default: return 'text-muted-foreground'
    }
  }

  if (!board) return null

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Go back" onClick={() => navigate('/')}>
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">{board.name}</h1>
            <p className="text-xs text-muted-foreground">{board.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ToggleGroup
            value={viewMode}
            onValueChange={(v) => v && setViewMode(v as 'kanban' | 'list')}
            type="single"
            aria-label="View mode"
          >
            <ToggleGroupItem value="list" aria-label="List view">
              <List data-icon="inline-start" />
              List
            </ToggleGroupItem>
            <ToggleGroupItem value="kanban" aria-label="Kanban view">
              <Columns3 data-icon="inline-start" />
              Kanban
            </ToggleGroupItem>
          </ToggleGroup>
          <Button variant="ghost" size="icon" aria-label="Board settings" onClick={() => navigate(`/board/${id}/settings`)}>
            <Settings className="size-5" />
          </Button>
        </div>
      </header>

      {/* Label filter bar */}
      {labels.length > 0 && (
        <div className="flex items-center gap-2 px-6 py-2 border-b bg-muted/30 shrink-0">
          <SlidersHorizontal className="size-3.5 text-muted-foreground shrink-0" />
          <div className="flex flex-wrap gap-1.5 items-center">
            {labels.map((label) => {
              const isActive = activeLabelIds.includes(label.id)
              return (
                <LabelPill
                  key={label.id}
                  label={label}
                  active={isActive || undefined}
                  onClick={() => toggleLabelFilter(label.id)}
                />
              )
            })}
          </div>
          {activeLabelIds.length > 0 && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearFilters}>
              <X className="size-3 mr-1" />
              Clear
            </Button>
          )}
        </div>
      )}

      {/* Content */}
      {viewMode === 'list' ? (
        <div className="p-6 overflow-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2 px-3">Task</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2 px-3">List</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2 px-3">Priority</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2 px-3">Labels</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2 px-3">Assignee</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2 px-3">Due</th>
              </tr>
            </thead>
            <tbody>
              {lists.flatMap((l) =>
                (l.tasks || []).filter(filterTask).map((t) => (
                  <tr
                    key={t.id}
                    className="border-b hover:bg-muted/50 cursor-pointer"
                    onClick={() => setSelectedTask(t)}
                  >
                    <td className="py-2.5 px-3 text-sm font-medium truncate max-w-[200px]">
                      {t.taskNumber && (
                        <span className="text-muted-foreground font-normal mr-1">{t.taskNumber}</span>
                      )}
                      {t.title}
                    </td>
                    <td className="py-2.5 px-3 text-sm text-muted-foreground">{l.name}</td>
                    <td className="py-2.5 px-3 text-sm">
                      <span className={cn("font-semibold text-xs", priorityColor(t.priority))}>
                        {t.priority}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-sm">
                      <div className="flex flex-wrap gap-1">
                        {(t.taskLabels ?? t.labels ?? []).map((tl) => (
                          <LabelPill key={tl.labelId} label={tl.label} />
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-sm text-muted-foreground">{t.assignee?.displayName || '—'}</td>
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
              {filteredLists.map((list) => (
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
                            className="size-2.5 rounded-full shrink-0"
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
                            className="size-6"
                            aria-label={`Add task to ${list.name}`}
                            onClick={() => setCreatingInList(list.id)}
                          >
                            <Plus className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 text-muted-foreground hover:text-destructive"
                            aria-label={`Delete ${list.name}`}
                            onClick={() => handleDeleteList(list.id)}
                          >
                            <X className="size-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Tasks */}
                      <div className="flex-1 p-2 flex flex-col gap-2 min-h-[60px]">
                        {(list.tasks || []).map((task, index) => (
                          <Draggable key={task.id} draggableId={task.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                onClick={() => setSelectedTask(task)}
                              >
                                <TaskCard task={task} isDragging={snapshot.isDragging} boardId={id} />
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
                <AddListForm boardId={board.id} />
              </div>
            </div>
          </ScrollArea>
        </DragDropContext>
      )}

      {/* Task detail modal */}
      {selectedTask && (
        <TaskDetail task={selectedTask} onClose={() => setSelectedTask(null)} />
      )}
    </div>
  )
}

function AddListForm({ boardId }: { boardId: string }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const queryClient = useQueryClient()

  const handleSubmit = async () => {
    if (!name.trim()) return
    await api.lists.create({ boardId, name: name.trim() })
    setName('')
    setEditing(false)
    queryClient.invalidateQueries({ queryKey: ['boards', boardId, 'full'] })
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
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
      <Plus data-icon="inline-start" />
      Add List
    </Button>
  )
}