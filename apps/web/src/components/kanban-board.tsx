import { useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { ArrowLeft, Plus, X, List, Columns3, Settings, SlidersHorizontal } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/hooks/api'
import { useBoardFull } from '@/hooks/use-boards'
import { useCreateTask } from '@/hooks/use-tasks'
import { useSocket } from '@/hooks/use-socket'
import { Task, Label } from '@/types'
import { TaskCard } from './task-card'
import { CreateTaskModal } from './create-task-modal'
import { LabelPill } from './label-pill'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

  const [creatingInList, setCreatingInList] = useState<string | null>(null)
  const [creatingSubTask, setCreatingSubTask] = useState<{ parentId: string; listId: string; parentTaskNumber?: string } | null>(null)
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')
  const [activeLabelIds, setActiveLabelIds] = useState<string[]>([])
  const [pendingDeleteListId, setPendingDeleteListId] = useState<string | null>(null)

  const createTask = useCreateTask()

  // Map of taskId → taskNumber for resolving parent badges on sub-task cards.
  const tasks = useMemo(() => lists.flatMap((l) => l.tasks || []), [lists])
  const taskNumberById = useMemo(() => new Map(tasks.map((t) => [t.id, t.taskNumber])), [tasks])

  // WebSocket handles cache invalidation via useSocket
  useSocket(id)

  const handleDragEnd = useCallback(async (result: DropResult) => {
    if (!result.destination || !id) return
    const { draggableId, source, destination } = result

    try {
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
    } catch (error) {
      toast.error("Failed to move task", { description: error instanceof Error ? error.message : 'Unknown error' })
    }
    queryClient.invalidateQueries({ queryKey: ['boards', id, 'full'] })
    queryClient.invalidateQueries({ queryKey: ['tasks', 'board', id] })
    queryClient.invalidateQueries({ queryKey: ['tasks', draggableId] })
  }, [id, lists, queryClient])

  const handleCreateTask = (listId: string, title: string, parentId?: string) => {
    if (!id) return
    createTask.mutate(
      { listId, title, boardId: id, parentId },
      { onSuccess: () => { setCreatingInList(null); setCreatingSubTask(null) } },
    )
  }

  async function handleDeleteList(listId: string) {
    try {
      await api.lists.delete(listId)
      toast.success("List deleted")
      queryClient.invalidateQueries({ queryKey: ['boards', id!, 'full'] })
      queryClient.invalidateQueries({ queryKey: ['boards'] })
    } catch (error) {
      toast.error("Failed to delete list", { description: error instanceof Error ? error.message : 'Unknown error' })
      queryClient.invalidateQueries({ queryKey: ['boards', id!, 'full'] })
    }
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
      case 'urgent': return 'text-[#eb5757]'
      case 'high': return 'text-[#eb5757]'
      case 'medium': return 'text-[#5e6ad2]'
      case 'low': return 'text-muted-foreground'
      default: return 'text-muted-foreground'
    }
  }

  const pendingDeleteList = pendingDeleteListId
    ? lists.find((l) => l.id === pendingDeleteListId)
    : null

  if (!board) return null

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Go back" onClick={() => navigate('/')}>
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <h1 className="text-lg font-medium tracking-tight text-foreground">{board.name}</h1>
            <p className="text-sm text-muted-foreground">{board.description}</p>
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
        <div className="flex items-center gap-2 px-6 py-2 border-b border-border bg-background shrink-0">
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
        <div className="p-6 overflow-auto bg-background">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
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
                    className="border-b border-border hover:bg-accent/50 cursor-pointer"
                    onClick={() => navigate(`/board/${id}/task/${t.id}`)}
                  >
                    <td className="py-2.5 px-3 text-sm font-medium text-foreground truncate max-w-[200px]">
                      {t.taskNumber && (
                        <span className="text-muted-foreground font-mono font-normal mr-1">{t.taskNumber}</span>
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
          <ScrollArea className="flex-1 p-6 bg-background">
            <div className="flex gap-4 h-full min-h-0">
              {filteredLists.map((list) => (
                <Droppable key={list.id} droppableId={list.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn(
                        "flex flex-col w-72 shrink-0 rounded-xl border border-border bg-card/50",
                        snapshot.isDraggingOver && "bg-accent/50"
                      )}
                    >
                      {/* List header */}
                      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
                        <div className="flex items-center gap-2">
                          <div
                            className="size-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: list.color || '#6366f1' }}
                          />
                          <span className="text-sm font-medium text-foreground">{list.name}</span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {list.tasks?.length || 0}
                          </span>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 text-muted-foreground hover:text-foreground"
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
                            onClick={() => setPendingDeleteListId(list.id)}
                          >
                            <X className="size-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Tasks */}
                      <div className="flex-1 p-2 space-y-2 flex flex-col min-h-[60px]">
                        {(list.tasks || []).map((task, index) => (
                          <Draggable key={task.id} draggableId={task.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                onClick={() => navigate(`/board/${id}/task/${task.id}`)}
                              >
                                <div className="relative group/sub">
                                  <TaskCard
                                    task={task}
                                    isDragging={snapshot.isDragging}
                                    boardId={id}
                                    parentTaskNumber={task.parentId ? taskNumberById.get(task.parentId) : undefined}
                                  />
                                  {/* Add sub-task hover action */}
                                  <button
                                    className="absolute top-1 right-1 opacity-0 group-hover/sub:opacity-100 transition-opacity size-5 rounded bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent flex items-center justify-center"
                                    aria-label="Add sub-task"
                                    title="Add sub-task"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setCreatingSubTask({
                                        parentId: task.id,
                                        listId: task.listId,
                                        parentTaskNumber: task.taskNumber,
                                      })
                                    }}
                                  >
                                    <Plus className="size-3" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>

                      {/* Inline create */}
                      {creatingInList === list.id && (
                        <div className="p-2 border-t border-border">
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

      {/* Delete list confirmation dialog */}
      <Dialog
        open={pendingDeleteListId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteListId(null) }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete list</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{pendingDeleteList?.name}&rdquo;? All tasks in this list will also be deleted. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteListId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingDeleteListId) {
                  handleDeleteList(pendingDeleteListId)
                  setPendingDeleteListId(null)
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sub-task creation modal */}
      {creatingSubTask && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/30" onClick={() => setCreatingSubTask(null)}>
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CreateTaskModal
              listId={creatingSubTask.listId}
              parentId={creatingSubTask.parentId}
              parentTaskNumber={creatingSubTask.parentTaskNumber}
              onSubmit={(title) => handleCreateTask(creatingSubTask.listId, title, creatingSubTask.parentId)}
              onClose={() => setCreatingSubTask(null)}
            />
          </div>
        </div>
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
    try {
      await api.lists.create({ boardId, name: name.trim() })
      toast.success("List created")
      setName('')
      setEditing(false)
      queryClient.invalidateQueries({ queryKey: ['boards', boardId, 'full'] })
      queryClient.invalidateQueries({ queryKey: ['boards'] })
    } catch (error) {
      toast.error("Failed to create list", { description: error instanceof Error ? error.message : 'Unknown error' })
      queryClient.invalidateQueries({ queryKey: ['boards', boardId, 'full'] })
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
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
      className="w-full border-dashed border-border text-muted-foreground hover:text-foreground"
      onClick={() => setEditing(true)}
    >
      <Plus data-icon="inline-start" />
      Add List
    </Button>
  )
}