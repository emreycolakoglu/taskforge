/**
 * ProjectKanbanBoard — the project page's kanban view (Projects v2 §4).
 *
 * Columns come from lib/project-kanban.ts: every status of every board with
 * a task in the project (empty ones included), boards in first-appearance
 * order, each header tagged with the board identifier so two boards'
 * "In Progress" stay distinguishable. Statuses are read from the boards' full
 * payloads (useBoardsFull — same cache as the board kanban).
 *
 * DnD mirrors kanban-board.tsx: planTaskMove runs against the board's FULL
 * columns with the project's tasks as the "visible" set, so a drop lands in
 * the right slot among board tasks that aren't in the project. Cross-board
 * drops are blocked twice — each Droppable's `type` is its board id (dnd only
 * drops a card on a same-type Droppable) and other boards' columns are
 * drop-disabled and dimmed while dragging. The API also 400s a foreign
 * status; any failure rolls the optimistic ['projects', id] update back.
 *
 * design.md: no Lime here (the page's Add task is its only CTA); columns are
 * Obsidian with Graphite borders; identifiers and counts in font-mono.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import type { DragStart, DropResult } from '@hello-pangea/dnd';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/hooks/api';
import { useBoardsFull } from '@/hooks/use-boards';
import { planTaskMove } from '@/lib/kanban-dnd';
import { applyProjectTaskMove, buildProjectColumns, isColumnDroppable } from '@/lib/project-kanban';
import { cn } from '@/lib/utils';
import type { ProjectDetail, Task } from '@/types';
import { TaskCard } from './task-card';

interface ProjectKanbanBoardProps {
  projectId: string;
  tasks: Task[];
}

export function ProjectKanbanBoard({ projectId, tasks }: ProjectKanbanBoardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const boardIds = useMemo(() => [...new Set(tasks.map((t) => t.boardId))], [tasks]);
  const boards = useBoardsFull(boardIds);
  const columns = useMemo(() => buildProjectColumns(tasks, boards), [tasks, boards]);
  const [draggingBoardId, setDraggingBoardId] = useState<string | null>(null);

  const handleDragStart = (start: DragStart) => {
    setDraggingBoardId(tasks.find((t) => t.id === start.draggableId)?.boardId ?? null);
  };

  const handleDragEnd = async (result: DropResult) => {
    setDraggingBoardId(null);
    const task = tasks.find((t) => t.id === result.draggableId);
    const board = boards.find((b) => b.id === task?.boardId);
    const target = board?.statuses?.find((s) => s.id === result.destination?.droppableId);
    // No destination, or a column of another board — nothing to do.
    if (!task || !board || !target || !result.destination) return;

    const plan = planTaskMove(board.statuses ?? [], columns, result);
    if (!plan) return;

    const position =
      plan.kind === 'move'
        ? plan.position
        : (plan.items.find((i) => i.id === task.id)?.position ?? task.position);
    const queryKey = ['projects', projectId];
    const previous = queryClient.getQueryData<ProjectDetail>(queryKey);
    if (previous?.tasks) {
      queryClient.setQueryData<ProjectDetail>(queryKey, {
        ...previous,
        tasks: applyProjectTaskMove(
          previous.tasks,
          task.id,
          target,
          result.destination.index,
          position,
        ),
      });
    }

    try {
      if (plan.kind === 'reorder') {
        await api.tasks.reorder(plan.items);
      } else {
        await api.tasks.move(plan.taskId, { statusId: plan.statusId, position: plan.position });
      }
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['boards', board.id, 'full'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'board', board.id] });
      queryClient.invalidateQueries({ queryKey: ['tasks', task.id] });
    } catch (error) {
      if (previous) queryClient.setQueryData(queryKey, previous);
      toast.error('Failed to move task', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  return (
    <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex items-start gap-4 overflow-x-auto pb-2">
        {columns.map((column) => {
          const droppable = isColumnDroppable(draggingBoardId, column);
          return (
            <Droppable
              key={column.id}
              droppableId={column.id}
              type={column.boardId}
              isDropDisabled={!droppable}
            >
              {(provided, snapshot) => (
                <section
                  data-testid={`project-column-${column.id}`}
                  aria-label={`${column.name} (${column.boardIdentifier})`}
                  className={cn(
                    'flex w-[300px] shrink-0 flex-col rounded-lg border border-border bg-card/40 transition-opacity',
                    snapshot.isDraggingOver && 'bg-accent/30',
                    !droppable && 'opacity-40',
                  )}
                >
                  <header className="flex h-[50px] shrink-0 items-center gap-2 border-b border-border px-3">
                    <span
                      data-testid="status-dot"
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: column.color ?? '#94a3b8' }}
                      aria-hidden="true"
                    />
                    <span className="truncate text-sm font-medium text-foreground">
                      {column.name}
                    </span>
                    <span
                      data-testid="column-count"
                      className="font-mono text-xs text-muted-foreground"
                    >
                      {column.tasks.length}
                    </span>
                    <span className="ml-auto shrink-0 rounded-sm border border-border px-1.5 font-mono text-[10px] text-muted-foreground">
                      {column.boardIdentifier}
                    </span>
                  </header>
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="min-h-[80px] space-y-1.5 p-2"
                  >
                    {column.tasks.length === 0 && (
                      <div className="py-6 text-center text-xs text-muted-foreground">
                        No issues
                      </div>
                    )}
                    {column.tasks.map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            // DraggableStyle lacks the CSS-var index signature React's
                            // CSSProperties carries here; the runtime shape is plain CSS.
                            style={dragProvided.draggableProps.style as CSSProperties}
                            onClick={() => navigate(`/board/${task.boardId}/task/${task.id}`)}
                          >
                            <TaskCard
                              task={task}
                              isDragging={dragSnapshot.isDragging}
                              hideProject
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                </section>
              )}
            </Droppable>
          );
        })}
      </div>
    </DragDropContext>
  );
}
