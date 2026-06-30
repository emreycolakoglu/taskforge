import { useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { Plus } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/hooks/api'
import { useBoardFull } from '@/hooks/use-boards'
import { useCreateTask } from '@/hooks/use-tasks'
import { useUsers } from '@/hooks/use-users'
import { useSocket } from '@/hooks/use-socket'
import { useBoardViewState } from '@/hooks/use-board-view-state'
import { Task, Label } from '@/types'
import { TaskCard } from './task-card'
import { BoardColumn } from './board-column'
import { BoardHeaderBar } from './board-header-bar'
import { FilterChipsBar } from './filter-chips-bar'
import { CreateTaskModal } from './create-task-modal'
import { CreateTaskDialog } from './create-task-dialog'
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
import { cn } from '@/lib/utils'

export function KanbanBoard() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: board } = useBoardFull(id!)
  const lists = board?.lists || []
  const labels: Label[] = board?.labels || []

  const { viewMode, setViewMode, filters, toggleLabelFilter, removeFilter, clearFilters } =
    useBoardViewState(id ?? '')

  const [creatingInList, setCreatingInList] = useState<string | null>(null)
  const [creatingSubTask, setCreatingSubTask] = useState<{ parentId: string; listId: string; parentTaskNumber?: string } | null>(null)
  const [pendingDeleteListId, setPendingDeleteListId] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  const createTask = useCreateTask()
  const { data: users = [] } = useUsers()

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

  const handleCreateTaskDialog = (data: { title: string; description?: string; listId: string; priority: string; assigneeId?: string | null }) => {
    if (!id) return
    createTask.mutate({ ...data, boardId: id })
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

  /** Filter tasks: show only tasks that have ALL active labels. */
  const filterTask = useCallback((task: Task) => {
    if (filters.labelIds.length === 0) return true
    const taskLabelIds = (task.taskLabels ?? task.labels ?? []).map((tl) => tl.labelId)
    return filters.labelIds.every((lid) => taskLabelIds.includes(lid))
  }, [filters.labelIds])

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

  const hasActiveFilters = filters.labelIds.length > 0

  if (!board) return null

  return (
    <div className="flex flex-col h-full">
      <BoardHeaderBar
        board={board}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onOpenFilters={() => { /* filter popover lives in FilterChipsBar; no-op here */ }}
        onOpenDisplay={() => { /* display options placeholder — out of scope */ }}
        onOpenSettings={() => navigate(`/board/${id}/settings`)}
        onNewTask={() => setCreateDialogOpen(true)}
      />

      {hasActiveFilters && (
        <FilterChipsBar
          filters={filters}
          labels={labels}
          onToggleLabel={toggleLabelFilter}
          onRemoveLabel={removeFilter}
          onClear={clearFilters}
        />
      )}

      {/* Content */}
      {viewMode === 'list' ? (
        <div className="flex-1 overflow-auto bg-background p-6">
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
          <div className="flex-1 overflow-x-auto bg-background">
            <div className="flex gap-4 h-full min-h-0 px-4 py-3">
              {filteredLists.map((list) => (
                <Droppable key={list.id} droppableId={list.id}>
                  {(provided, snapshot) => (
                    <BoardColumn
                      list={list}
                      taskCount={list.tasks?.length || 0}
                      isAdding={creatingInList === list.id}
                      onAddTask={() => setCreatingInList(list.id)}
                      onDeleteList={() => setPendingDeleteListId(list.id)}
                      onEditList={() => navigate(`/board/${id}/settings`)}
                      droppableProvided={{
                        innerRef: provided.innerRef,
                        droppableProps: provided.droppableProps as unknown as Record<string, unknown>,
                        placeholder: provided.placeholder,
                      }}
                      isDraggingOver={snapshot.isDraggingOver}
                    >
                      {(list.tasks || []).map((task, index) => (
                        <Draggable key={task.id} draggableId={task.id} index={index}>
                          {(dragProvided, dragSnapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              onClick={() => navigate(`/board/${id}/task/${task.id}`)}
                            >
                              <TaskCard
                                task={task}
                                isDragging={dragSnapshot.isDragging}
                                boardId={id}
                                parentTaskNumber={task.parentId ? taskNumberById.get(task.parentId) : undefined}
                                onAddSubTask={() => setCreatingSubTask({
                                  parentId: task.id,
                                  listId: task.listId,
                                  parentTaskNumber: task.taskNumber,
                                })}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}

                      {/* Inline quick-add inside the column footer slot */}
                      {creatingInList === list.id && (
                        <CreateTaskModal
                          listId={list.id}
                          onSubmit={(title) => handleCreateTask(list.id, title)}
                          onClose={() => setCreatingInList(null)}
                        />
                      )}
                    </BoardColumn>
                  )}
                </Droppable>
              ))}

              {/* Add list */}
              <div className="w-[348px] shrink-0">
                <AddListForm boardId={board.id} />
              </div>
            </div>
          </div>
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

      {/* Create task dialog (header CTA) */}
      <CreateTaskDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        lists={lists}
        users={users}
        onSubmit={handleCreateTaskDialog}
      />

      {/* Sub-task creation dialog */}
      <Dialog
        open={creatingSubTask !== null}
        onOpenChange={(open) => { if (!open) setCreatingSubTask(null) }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              New sub-task
              {creatingSubTask?.parentTaskNumber && (
                <span className="ml-2 text-xs font-mono text-muted-foreground font-normal">
                  of {creatingSubTask.parentTaskNumber}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <CreateTaskModal
            listId={creatingSubTask?.listId ?? ''}
            parentId={creatingSubTask?.parentId}
            parentTaskNumber={creatingSubTask?.parentTaskNumber}
            onSubmit={(title) => {
              if (creatingSubTask) {
                handleCreateTask(creatingSubTask.listId, title, creatingSubTask.parentId)
              }
            }}
            onClose={() => setCreatingSubTask(null)}
          />
        </DialogContent>
      </Dialog>
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
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
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