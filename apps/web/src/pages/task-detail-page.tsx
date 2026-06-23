/**
 * TaskDetailPage — Linear-style task detail view.
 *
 * Thin orchestrator: data hooks + layout composition. Two-column layout:
 * main content (scrolls, max-w-3xl) + right properties sidebar (w-[260px],
 * scrolls independently). Breadcrumb bar is sticky above both columns.
 *
 * design.md compliance: no Lime CTA on the detail page (the screen's primary
 * action is editing, not creation). All Save/Submit buttons are outline/ghost.
 * Dark-only, border-defined rows, Inter weight 510 emphasis, JetBrains Mono for
 * IDs/timestamps.
 */

import { useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useTask, useUpdateTask, useTasksByBoard, useCreateTask } from '@/hooks/use-tasks'
import { useTaskRelations, useCreateRelation, useRemoveRelation } from '@/hooks/use-relations'
import { useBoardFull } from '@/hooks/use-boards'
import { useComments, useCreateComment } from '@/hooks/use-comments'
import { useUsers } from '@/hooks/use-users'
import { useLabels } from '@/hooks/use-labels'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { DetailBreadcrumbBar } from '@/components/detail-breadcrumb-bar'
import { DetailTitleBlock } from '@/components/detail-title-block'
import { DetailDescriptionEditor } from '@/components/detail-description-editor'
import { DetailSubIssues } from '@/components/detail-sub-issues'
import { DetailRelations } from '@/components/detail-relations'
import { DetailActivity } from '@/components/detail-activity'
import { DetailComments } from '@/components/detail-comments'
import { DetailPropertiesSidebar } from '@/components/detail-properties-sidebar'
import type { RelationType, Task } from '@/types'

export function TaskDetailPage() {
  const { boardId, taskId } = useParams<{ boardId: string; taskId: string }>()
  const navigate = useNavigate()

  const { data: task, isLoading: taskLoading, error: taskError } = useTask(taskId!)
  const { data: board } = useBoardFull(boardId!)
  const { data: comments = [] } = useComments(taskId!)
  const { data: users = [] } = useUsers()
  const { data: _labels = [] } = useLabels(boardId!)
  const { data: boardTasks = [] } = useTasksByBoard(boardId!)

  const updateTask = useUpdateTask()
  const createComment = useCreateComment()
  const createTask = useCreateTask()
  const { data: relations } = useTaskRelations(taskId!)
  const createRelation = useCreateRelation()
  const removeRelation = useRemoveRelation()

  // ── Navigation: prev/next task ─────────────────────────────────────────────

  const sortedTasks = useMemo(
    () => [...boardTasks].sort((a, b) => (a.taskNumber ?? '').localeCompare(b.taskNumber ?? '')),
    [boardTasks],
  )

  const currentIndex = sortedTasks.findIndex((t) => t.id === taskId)
  const prevTask = currentIndex > 0 ? sortedTasks[currentIndex - 1] : null
  const nextTask = currentIndex < sortedTasks.length - 1 ? sortedTasks[currentIndex + 1] : null

  const navigateToTask = useCallback(
    (id: string) => navigate(`/board/${boardId}/task/${id}`),
    [boardId, navigate],
  )

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleUpdate = useCallback(
    (data: Partial<Task>) => {
      if (!task || !boardId) return
      updateTask.mutate({ id: task.id, boardId, data })
    },
    [task, boardId, updateTask],
  )

  const handleAddComment = useCallback(
    (body: string) => {
      if (!task) return
      createComment.mutate({ taskId: task.id, author: 'user', body })
    },
    [task, createComment],
  )

  const handleCreateSubTask = useCallback(
    (title: string) => {
      if (!task || !boardId) return
      createTask.mutate({ listId: task.listId, title, boardId, parentId: task.id })
    },
    [task, boardId, createTask],
  )

  const handleAddRelation = useCallback(
    (otherTaskId: string, type: RelationType, direction?: 'source' | 'target') => {
      if (!task || !boardId) return
      createRelation.mutate({ taskId: task.id, boardId, otherTaskId, type, direction })
    },
    [task, boardId, createRelation],
  )

  const handleRemoveRelation = useCallback(
    (relationId: string) => {
      if (!task || !boardId) return
      removeRelation.mutate({ taskId: task.id, boardId, relationId })
    },
    [task, boardId, removeRelation],
  )

  const handleScrollTo = useCallback((anchor: string) => {
    document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // ── Loading / not-found ────────────────────────────────────────────────────

  if (taskLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-muted-foreground">Loading task…</div>
      </div>
    )
  }

  if (taskError || !task) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-background">
        <p className="text-destructive">Task not found.</p>
        <Button variant="outline" onClick={() => navigate(`/board/${boardId}`)}>
          <ArrowLeft className="size-4 mr-2" />
          Back to board
        </Button>
      </div>
    )
  }

  // ── Derived data ───────────────────────────────────────────────────────────

  const boardName = board?.name ?? 'Board'
  const listName = board?.lists?.find((l) => l.id === task.listId)?.name ?? 'Unknown list'

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts)
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const position = {
    current: currentIndex >= 0 ? currentIndex + 1 : 0,
    total: sortedTasks.length,
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-background">
      <DetailBreadcrumbBar
        boardName={boardName}
        listName={listName}
        taskNumber={task.taskNumber}
        taskId={task.id}
        boardId={boardId!}
        position={position}
        prevTask={prevTask ?? undefined}
        nextTask={nextTask ?? undefined}
        onBack={() => navigate(`/board/${boardId}`)}
        onNavigateTask={navigateToTask}
      />

      <div className="flex flex-1 min-h-0">
        {/* Main content column */}
        <ScrollArea className="flex-1">
          <div className="px-8 py-6 space-y-8 bg-background max-w-3xl">
            <DetailTitleBlock
              task={task}
              onSaveTitle={(title) => handleUpdate({ title })}
              onNavigateParent={navigateToTask}
            />

            <DetailDescriptionEditor
              value={task.description ?? ''}
              onSave={(description) => handleUpdate({ description })}
            />

            <DetailSubIssues
              task={task}
              boardId={boardId!}
              onNavigate={navigateToTask}
              onCreateSubTask={handleCreateSubTask}
            />

            <Separator />

            <DetailRelations
              relations={relations ?? { taskId: task.id, blocking: [], blockedBy: [], relatedTo: [] }}
              taskId={task.id}
              boardId={boardId!}
              boardTasks={boardTasks}
              onAdd={handleAddRelation}
              onRemove={handleRemoveRelation}
              onNavigate={navigateToTask}
            />

            <Separator />

            <DetailActivity
              activity={task.activity ?? []}
              formatTimestamp={formatTimestamp}
            />

            <Separator />

            <DetailComments
              comments={comments}
              onSubmit={handleAddComment}
              formatTimestamp={formatTimestamp}
            />
          </div>
        </ScrollArea>

        {/* Right sidebar */}
        <DetailPropertiesSidebar
          task={task}
          board={board}
          users={users}
          boardTasks={boardTasks}
          relations={relations}
          onUpdate={handleUpdate}
          onNavigate={navigateToTask}
          onScrollTo={handleScrollTo}
          formatTimestamp={formatTimestamp}
        />
      </div>
    </div>
  )
}