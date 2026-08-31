import { useState, useCallback, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/hooks/api';
import { useBoardFull } from '@/hooks/use-boards';
import { useCreateTask } from '@/hooks/use-tasks';
import { useUsers } from '@/hooks/use-users';
import { useSocket } from '@/hooks/use-socket';
import { useBoardViewState } from '@/hooks/use-board-view-state';
import { useActiveView } from '@/hooks/use-view-state';
import { useDragScroll } from '@/hooks/use-drag-scroll';
import {
  applyViewFilters,
  DEFAULT_FILTER_STATE,
  groupTasksBy,
  sortTasks,
  type TaskGroup,
  type ViewFilterState,
} from '@/lib/apply-view';
import { Task, Label, Board, Status, ViewGroupBy, ViewSortBy } from '@/types';
import type { ViewMode } from '@/hooks/use-board-view-state';
import { planTaskMove } from '@/lib/kanban-dnd';
import { TaskCard } from './task-card';
import { BoardColumn } from './board-column';
import { BoardHeaderBar } from './board-header-bar';
import { FilterChipsBar } from './filter-chips-bar';
import { QuickAddInput } from './quick-add-input';
import { CreateTaskDialog } from './create-task-dialog';
import { LabelPill } from './label-pill';
import { ProgressIcon } from './progress-icon';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export function KanbanBoard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: board } = useBoardFull(id!);
  const statuses = board?.statuses || [];
  const labels: Label[] = board?.labels || [];

  const { viewMode, setViewMode, filters, toggleLabelFilter, removeFilter, clearFilters } =
    useBoardViewState(id ?? '');

  const { activeView } = useActiveView(id ?? '');

  // When a saved view is active, its layout drives the mode; a manual toggle is
  // a local deviation stored as an override that wins for the session and resets
  // when the active view changes.
  const [layoutOverride, setLayoutOverride] = useState<ViewMode | null>(null);
  useEffect(() => {
    setLayoutOverride(null);
  }, [activeView?.id]);
  const effectiveViewMode: ViewMode =
    layoutOverride ?? (activeView ? (activeView.layout === 'list' ? 'list' : 'kanban') : viewMode);

  const effectiveGroupBy: ViewGroupBy = activeView?.groupBy ?? 'status';
  const effectiveSortBy: ViewSortBy = activeView?.sortBy ?? 'position';

  const effectiveFilters: ViewFilterState = useMemo(() => {
    if (!activeView) return { ...filters };
    const vf = activeView.filters;
    return {
      labelIds: vf.labelIds ?? DEFAULT_FILTER_STATE.labelIds,
      assigneeIds: vf.assigneeIds ?? DEFAULT_FILTER_STATE.assigneeIds,
      priorities: vf.priorities ?? DEFAULT_FILTER_STATE.priorities,
      dueDateRange: {
        from: vf.dueDateRange?.from ?? DEFAULT_FILTER_STATE.dueDateRange.from,
        to: vf.dueDateRange?.to ?? DEFAULT_FILTER_STATE.dueDateRange.to,
      },
      searchQuery: vf.searchQuery ?? DEFAULT_FILTER_STATE.searchQuery,
    };
  }, [activeView, filters]);

  const [creatingInStatus, setCreatingInStatus] = useState<string | null>(null);
  const [creatingSubTask, setCreatingSubTask] = useState<{
    parentId: string;
    statusId: string;
    parentTaskNumber?: string;
  } | null>(null);
  const [pendingDeleteStatusId, setPendingDeleteStatusId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const createTask = useCreateTask();
  const { data: users = [] } = useUsers();

  const { ref: boardScrollRef, isDragging: isPanning } = useDragScroll<HTMLDivElement>();

  // Map of taskId → taskNumber for resolving parent badges on sub-task cards.
  const tasks = useMemo(() => statuses.flatMap((s) => s.tasks || []), [statuses]);
  const taskNumberById = useMemo(() => new Map(tasks.map((t) => [t.id, t.taskNumber])), [tasks]);
  const taskTitleById = useMemo(() => new Map(tasks.map((t) => [t.id, t.title])), [tasks]);

  // WebSocket handles cache invalidation via useSocket
  useSocket(id);

  const matchesFilters = useCallback(
    (task: Task) => applyViewFilters(task, effectiveFilters),
    [effectiveFilters],
  );

  const filteredStatuses = useMemo(() => {
    return statuses.map((status) => ({
      ...status,
      tasks: sortTasks((status.tasks || []).filter(matchesFilters), effectiveSortBy),
    }));
  }, [statuses, matchesFilters, effectiveSortBy]);

  // Read-only grouped columns for non-status groupings (DnD disabled).
  const viewGroups: TaskGroup[] = useMemo(() => {
    if (effectiveGroupBy === 'status' || effectiveViewMode === 'list') return [];
    return groupTasksBy(tasks.filter(matchesFilters), statuses, effectiveGroupBy, labels).map(
      (g) => ({ ...g, tasks: sortTasks(g.tasks, effectiveSortBy) }),
    );
  }, [
    effectiveGroupBy,
    effectiveViewMode,
    tasks,
    matchesFilters,
    statuses,
    labels,
    effectiveSortBy,
  ]);

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);

  // Flat, filtered + sorted row set for list view. Grouping only affects the
  // board layout; list stays flat.
  const listTasks = useMemo(
    () => sortTasks(tasks.filter(matchesFilters), effectiveSortBy),
    [tasks, matchesFilters, effectiveSortBy],
  );

  const handleDragEnd = useCallback(
    async (result: DropResult) => {
      if (!id) return;
      const plan = planTaskMove(statuses, filteredStatuses, result);
      if (!plan) return;

      // Optimistically render the move immediately: without this the card snaps
      // back to its origin and only jumps to the new column once the API call
      // resolves and the query refetches. We snapshot the board first so we can
      // roll back if the request fails.
      const queryKey = ['boards', id, 'full'];
      const previousBoard = queryClient.getQueryData<Board>(queryKey);
      if (previousBoard) {
        queryClient.setQueryData<Board>(queryKey, { ...previousBoard, statuses: plan.statuses });
      }

      try {
        if (plan.kind === 'reorder') {
          await api.tasks.reorder(plan.items);
        } else {
          await api.tasks.move(plan.taskId, { statusId: plan.statusId, position: plan.position });
        }
        queryClient.invalidateQueries({ queryKey: ['boards', id, 'full'] });
        queryClient.invalidateQueries({ queryKey: ['tasks', 'board', id] });
        queryClient.invalidateQueries({ queryKey: ['tasks', result.draggableId] });
      } catch (error) {
        if (previousBoard) queryClient.setQueryData(queryKey, previousBoard);
        toast.error('Failed to move task', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
    [id, statuses, filteredStatuses, queryClient],
  );

  const handleCreateTask = (statusId: string, title: string, parentId?: string) => {
    if (!id) return;
    setCreatingInStatus(null);
    setCreatingSubTask(null);
    createTask.mutate({ statusId, title, boardId: id, parentId });
  };

  const handleCreateTaskDialog = (data: {
    title: string;
    description?: string;
    statusId: string;
    priority: string;
    assigneeId?: string | null;
  }) => {
    if (!id) return;
    createTask.mutate({ ...data, boardId: id });
  };

  async function handleDeleteStatus(statusId: string) {
    try {
      await api.statuses.delete(statusId);
      toast.success('Status deleted');
      queryClient.invalidateQueries({ queryKey: ['boards', id!, 'full'] });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
    } catch (error) {
      toast.error('Failed to delete status', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
      queryClient.invalidateQueries({ queryKey: ['boards', id!, 'full'] });
    }
  }

  const handleViewModeChange = (mode: ViewMode) => {
    if (activeView) setLayoutOverride(mode);
    setViewMode(mode);
  };

  const priorityColor = (p: string) => {
    switch (p) {
      case 'urgent':
        return 'text-[#eb5757]';
      case 'high':
        return 'text-[#eb5757]';
      case 'medium':
        return 'text-[#5e6ad2]';
      case 'low':
        return 'text-muted-foreground';
      default:
        return 'text-muted-foreground';
    }
  };

  const pendingDeleteStatus = pendingDeleteStatusId
    ? statuses.find((s) => s.id === pendingDeleteStatusId)
    : null;

  const hasActiveFilters = filters.labelIds.length > 0;

  if (!board) return null;

  const renderGroupColumns = (groups: TaskGroup[], draggable: boolean) => (
    <div
      ref={draggable ? undefined : boardScrollRef}
      className={cn(
        'flex-1 overflow-x-auto bg-background',
        isPanning && 'cursor-grabbing select-none',
      )}
    >
      <div className="flex gap-4 h-full min-h-0 px-4 py-3">
        {groups.map((group) => {
          // Status groups map to the real Status row; synthetic groups (priority,
          // assignee, label, none) render as a fabricated Status-shaped column.
          const status: Status =
            statusById.get(group.id) ??
            ({
              id: group.id,
              boardId: '',
              name: group.name,
              type: group.type,
              position: group.position,
              tasks: group.tasks,
            } as Status);
          return draggable ? (
            <Droppable key={group.id} droppableId={group.id}>
              {(provided, snapshot) => (
                <BoardColumn
                  status={status}
                  taskCount={group.tasks.length}
                  isAdding={creatingInStatus === group.id}
                  onAddTask={() => setCreatingInStatus(group.id)}
                  onDeleteStatus={() => setPendingDeleteStatusId(group.id)}
                  onEditStatus={() => navigate(`/board/${id}/settings/statuses`)}
                  droppableProvided={{
                    innerRef: provided.innerRef,
                    droppableProps: provided.droppableProps as unknown as Record<string, unknown>,
                    placeholder: provided.placeholder,
                  }}
                  isDraggingOver={snapshot.isDraggingOver}
                >
                  {group.tasks.map((task, index) => (
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
                            parentTaskNumber={
                              task.parentId ? taskNumberById.get(task.parentId) : undefined
                            }
                            parentTaskName={
                              task.parentId ? taskTitleById.get(task.parentId) : undefined
                            }
                            onAddSubTask={() =>
                              setCreatingSubTask({
                                parentId: task.id,
                                statusId: task.statusId,
                                parentTaskNumber: task.taskNumber,
                              })
                            }
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}

                  {/* Inline quick-add inside the column footer slot */}
                  {creatingInStatus === group.id && (
                    <QuickAddInput
                      statusId={group.id}
                      onSubmit={(title) => handleCreateTask(group.id, title)}
                      onClose={() => setCreatingInStatus(null)}
                    />
                  )}
                </BoardColumn>
              )}
            </Droppable>
          ) : (
            <BoardColumn
              key={group.id}
              status={status}
              taskCount={group.tasks.length}
              isAdding={false}
              onAddTask={() => {}}
              onDeleteStatus={() => {}}
              onEditStatus={() => {}}
            >
              {group.tasks.map((task) => (
                <div key={task.id} onClick={() => navigate(`/board/${id}/task/${task.id}`)}>
                  <TaskCard
                    task={task}
                    boardId={id}
                    parentTaskNumber={task.parentId ? taskNumberById.get(task.parentId) : undefined}
                    parentTaskName={task.parentId ? taskTitleById.get(task.parentId) : undefined}
                    onAddSubTask={() =>
                      setCreatingSubTask({
                        parentId: task.id,
                        statusId: task.statusId,
                        parentTaskNumber: task.taskNumber,
                      })
                    }
                  />
                </div>
              ))}
            </BoardColumn>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <BoardHeaderBar
        board={board}
        viewMode={effectiveViewMode}
        onViewModeChange={handleViewModeChange}
        onOpenSettings={() => navigate(`/board/${id}/settings`)}
        onNewTask={() => setCreateDialogOpen(true)}
      />

      {/* When a saved view is active its filters come from the view (chips are Task 10) */}
      {hasActiveFilters && !activeView && (
        <FilterChipsBar
          filters={filters}
          labels={labels}
          onToggleLabel={toggleLabelFilter}
          onRemoveLabel={removeFilter}
          onClear={clearFilters}
        />
      )}

      {/* Content */}
      {effectiveViewMode === 'list' ? (
        <div className="flex-1 overflow-auto bg-background p-6">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2 px-3">
                  Task
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2 px-3">
                  Status
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2 px-3">
                  Priority
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2 px-3">
                  Labels
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2 px-3">
                  Assignee
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2 px-3">
                  Due
                </th>
              </tr>
            </thead>
            <tbody>
              {listTasks.map((t) => {
                const s = statusById.get(t.statusId);
                return (
                  <tr
                    key={t.id}
                    className="border-b border-border hover:bg-accent/50 cursor-pointer"
                    onClick={() => navigate(`/board/${id}/task/${t.id}`)}
                  >
                    <td className="py-2.5 px-3 text-sm font-medium text-foreground truncate max-w-[200px]">
                      {t.taskNumber && (
                        <span className="text-muted-foreground font-mono font-normal mr-1">
                          {t.taskNumber}
                        </span>
                      )}
                      {t.title}
                    </td>
                    <td className="py-2.5 px-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <ProgressIcon progress={s?.progress ?? 0} type={s?.type} size={14} />
                        {s?.name ?? '—'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-sm">
                      <span className={cn('font-semibold text-xs', priorityColor(t.priority))}>
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
                    <td className="py-2.5 px-3 text-sm text-muted-foreground">
                      {t.assignee?.displayName || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-sm text-muted-foreground">
                      {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : effectiveGroupBy === 'status' ? (
        <DragDropContext onDragEnd={handleDragEnd}>
          {renderGroupColumns(filteredStatuses, true)}
        </DragDropContext>
      ) : (
        renderGroupColumns(viewGroups, false)
      )}

      {/* Delete status confirmation dialog */}
      <Dialog
        open={pendingDeleteStatusId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteStatusId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete status</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{pendingDeleteStatus?.name}&rdquo;? All tasks
              in this status will also be deleted. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteStatusId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingDeleteStatusId) {
                  handleDeleteStatus(pendingDeleteStatusId);
                  setPendingDeleteStatusId(null);
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
        statuses={statuses}
        users={users}
        onSubmit={handleCreateTaskDialog}
      />

      {/* Sub-task creation dialog */}
      <Dialog
        open={creatingSubTask !== null}
        onOpenChange={(open) => {
          if (!open) setCreatingSubTask(null);
        }}
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
          <QuickAddInput
            statusId={creatingSubTask?.statusId ?? ''}
            parentId={creatingSubTask?.parentId}
            parentTaskNumber={creatingSubTask?.parentTaskNumber}
            onSubmit={(title) => {
              if (creatingSubTask) {
                handleCreateTask(creatingSubTask.statusId, title, creatingSubTask.parentId);
              }
            }}
            onClose={() => setCreatingSubTask(null)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
