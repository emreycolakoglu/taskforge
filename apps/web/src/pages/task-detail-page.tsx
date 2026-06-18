import { useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  SignalLow,
  SignalMedium,
  SignalHigh,
  AlertTriangle,
  Calendar,
  Clock,
  MessageSquare,
  Activity,
  ListChecks,
} from 'lucide-react'
import { useTask, useUpdateTask, useTasksByBoard } from '@/hooks/use-tasks'
import { useBoardFull } from '@/hooks/use-boards'
import { useComments, useCreateComment } from '@/hooks/use-comments'
import { useUsers } from '@/hooks/use-users'
import { useLabels } from '@/hooks/use-labels'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LabelPill } from '@/components/label-pill'
import { cn } from '@/lib/utils'
import type { Task } from '@/types'

// ── Priority icons ──────────────────────────────────────────────────────────

function PriorityIcon({ priority }: { priority: Task['priority'] }) {
  switch (priority) {
    case 'urgent':
      return <AlertTriangle className="size-4 text-destructive" />
    case 'high':
      return <SignalHigh className="size-4 text-orange-500" />
    case 'medium':
      return <SignalMedium className="size-4 text-indigo-500" />
    case 'low':
      return <SignalLow className="size-4 text-muted-foreground" />
  }
}

// ── Editable title ───────────────────────────────────────────────────────────

function EditableTitle({
  value,
  onSave,
}: {
  value: string
  onSave: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  const startEdit = () => {
    setDraft(value)
    setEditing(true)
  }

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) {
      onSave(trimmed)
    }
    setEditing(false)
  }

  const cancel = () => {
    setDraft(value)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') cancel()
        }}
        className="text-xl font-bold bg-transparent border-b border-primary outline-none w-full"
      />
    )
  }

  return (
    <h1
      className="text-xl font-bold cursor-text hover:bg-accent/50 rounded px-1 -mx-1"
      onClick={startEdit}
    >
      {value}
    </h1>
  )
}

// ── Editable description ─────────────────────────────────────────────────────

function EditableDescription({
  value,
  onSave,
}: {
  value: string
  onSave: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (!editing) {
    return (
      <div
        className="text-sm text-muted-foreground cursor-text hover:bg-accent/50 rounded p-2 -mx-2 min-h-[80px]"
        onClick={() => {
          setDraft(value)
          setEditing(true)
        }}
      >
        {value || (
          <span className="italic">Add a description…</span>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={6}
        placeholder="Add a description…"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => { onSave(draft); setEditing(false) }}>
          Save
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => { setDraft(value); setEditing(false) }}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export function TaskDetailPage() {
  const { boardId, taskId } = useParams<{ boardId: string; taskId: string }>()
  const navigate = useNavigate()

  const { data: task, isLoading: taskLoading, error: taskError } = useTask(taskId!)
  const { data: board } = useBoardFull(boardId!)
  const { data: comments = [] } = useComments(taskId!)
  const { data: users = [] } = useUsers()
  const { data: labels = [] } = useLabels(boardId!)
  const { data: boardTasks = [] } = useTasksByBoard(boardId!)

  const updateTask = useUpdateTask()
  const createComment = useCreateComment()

  const [commentText, setCommentText] = useState('')

  // ── Navigation: prev/next task ─────────────────────────────────────────────

  const sortedTasks = useMemo(
    () => [...boardTasks].sort((a, b) => (a.taskNumber ?? '').localeCompare(b.taskNumber ?? '')),
    [boardTasks],
  )

  const currentIndex = sortedTasks.findIndex((t) => t.id === taskId)
  const prevTask = currentIndex > 0 ? sortedTasks[currentIndex - 1] : null
  const nextTask = currentIndex < sortedTasks.length - 1 ? sortedTasks[currentIndex + 1] : null

  const navigateToTask = useCallback(
    (t: { id: string }) => navigate(`/board/${boardId}/task/${t.id}`),
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

  const handleAddComment = useCallback(() => {
    if (!commentText.trim() || !task) return
    createComment.mutate(
      { taskId: task.id, author: 'user', body: commentText.trim() },
      { onSuccess: () => setCommentText('') },
    )
  }, [commentText, task, createComment])

  // ── Loading / not-found ────────────────────────────────────────────────────

  if (taskLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading task…</div>
      </div>
    )
  }

  if (taskError || !task) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-destructive">Task not found.</p>
        <Button variant="outline" onClick={() => navigate(`/board/${boardId}`)}>
          <ArrowLeft className="size-4 mr-2" />
          Back to board
        </Button>
      </div>
    )
  }

  // ── Derived data ────────────────────────────────────────────────────────────

  const taskLabels = task.taskLabels ?? task.labels ?? []
  const listName = board?.lists?.find((l) => l.id === task.listId)?.name ?? 'Unknown list'

  const priorityOptions: Task['priority'][] = ['low', 'medium', 'high', 'urgent']

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts)
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full">
      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header bar */}
        <header className="flex items-center gap-2 px-4 py-2 border-b shrink-0">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to board"
            onClick={() => navigate(`/board/${boardId}`)}
          >
            <ArrowLeft className="size-4" />
          </Button>

          {task.taskNumber && (
            <span className="text-sm text-muted-foreground font-medium mr-1">
              {task.taskNumber}
            </span>
          )}

          <div className="flex-1 min-w-0">
            <EditableTitle
              value={task.title}
              onSave={(title) => handleUpdate({ title })}
            />
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              disabled={!prevTask}
              aria-label="Previous task"
              onClick={() => prevTask && navigateToTask(prevTask)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={!nextTask}
              aria-label="Next task"
              onClick={() => nextTask && navigateToTask(nextTask)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </header>

        {/* Scrollable body */}
        <ScrollArea className="flex-1">
          <div className="max-w-3xl px-6 py-4 space-y-6">
            {/* Labels */}
            {taskLabels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {taskLabels.map((tl) => (
                  <LabelPill key={tl.labelId} label={tl.label} />
                ))}
              </div>
            )}

            {/* Description */}
            <section>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Description
              </h3>
              <EditableDescription
                value={task.description ?? ''}
                onSave={(description) => handleUpdate({ description })}
              />
            </section>

            <Separator />

            {/* Sub-issues placeholder */}
            <section>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Sub-issues
              </h3>
              <p className="text-sm text-muted-foreground italic">
                Sub-issues coming soon
              </p>
            </section>

            <Separator />

            {/* Activity */}
            {task.activity && task.activity.length > 0 && (
              <section>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Activity className="size-3.5" />
                  Activity
                </h3>
                <div className="space-y-2.5">
                  {task.activity.map((a) => (
                    <div key={a.id} className="text-sm flex items-start gap-2">
                      <div className="size-5 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-[10px] font-semibold text-muted-foreground">
                          {a.actor.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="font-medium">{a.actor}</span>{' '}
                        <span className="text-muted-foreground">{a.action}</span>
                        {a.detail && (() => {
                          try {
                            const d = JSON.parse(a.detail)
                            const extra = d.changes
                              ? ` — ${d.changes.join(', ')}`
                              : d.to
                              ? ` → ${d.to}`
                              : d.listName
                              ? ` → ${d.listName}`
                              : ''
                            return <span className="text-muted-foreground">{extra}</span>
                          } catch {
                            return null
                          }
                        })()}
                        <span className="text-xs text-muted-foreground ml-2">
                          {formatTimestamp(a.createdAt)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <Separator />

            {/* Comments */}
            <section>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <MessageSquare className="size-3.5" />
                Comments ({comments.length})
              </h3>
              <div className="flex gap-2 mb-4">
                <Input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                  placeholder="Add a comment…"
                  className="flex-1"
                />
                <Button size="sm" onClick={handleAddComment} disabled={!commentText.trim()}>
                  Send
                </Button>
              </div>
              <div className="space-y-3">
                {comments.map((c) => (
                  <div key={c.id} className="flex items-start gap-2">
                    <div className="size-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-600 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                      {c.author.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{c.author}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(c.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm mt-0.5">{c.body}</p>
                    </div>
                  </div>
                ))}
                {comments.length === 0 && (
                  <p className="text-sm text-muted-foreground">No comments yet.</p>
                )}
              </div>
            </section>
          </div>
        </ScrollArea>
      </div>

      {/* ── Right sidebar ─────────────────────────────────────────────────── */}
      <aside className="w-[280px] border-l bg-muted/30 shrink-0 overflow-y-auto">
        <div className="p-4 space-y-5">
          {/* Status */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
              Status
            </label>
            <Select
              value={task.status}
              onValueChange={(v) => handleUpdate({ status: v as Task['status'] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="done">Done</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Priority */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
              Priority
            </label>
            <div className="flex gap-1">
              {priorityOptions.map((p) => (
                <button
                  key={p}
                  onClick={() => handleUpdate({ priority: p })}
                  className={cn(
                    'flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors',
                    task.priority === p
                      ? p === 'urgent'
                        ? 'bg-destructive text-destructive-foreground'
                        : p === 'high'
                        ? 'bg-orange-500 text-white'
                        : p === 'medium'
                        ? 'bg-indigo-500 text-white'
                        : 'bg-muted-foreground/20 text-muted-foreground'
                      : 'text-muted-foreground hover:bg-accent',
                  )}
                >
                  <PriorityIcon priority={p} />
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Assignee */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
              Assignee
            </label>
            <Select
              value={task.assigneeId ?? '__none__'}
              onValueChange={(v) =>
                handleUpdate({ assigneeId: v === '__none__' ? null : v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Unassigned</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Labels */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
              Labels
            </label>
            <div className="flex flex-wrap gap-1.5">
              {taskLabels.map((tl) => (
                <Badge
                  key={tl.labelId}
                  style={{ backgroundColor: tl.label.color }}
                  className="text-white border-0"
                >
                  {tl.label.name}
                </Badge>
              ))}
              {taskLabels.length === 0 && (
                <span className="text-sm text-muted-foreground">None</span>
              )}
            </div>
          </div>

          {/* Due date */}
          {task.dueDate && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
                Due date
              </label>
              <div className="flex items-center gap-1.5 text-sm">
                <Calendar className="size-3.5 text-muted-foreground" />
                {new Date(task.dueDate).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
            </div>
          )}

          {/* List */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
              List
            </label>
            <div className="flex items-center gap-1.5 text-sm">
              <ListChecks className="size-3.5 text-muted-foreground" />
              {listName}
            </div>
          </div>

          <Separator />

          {/* Timestamps */}
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Clock className="size-3" />
              Created {formatTimestamp(task.createdAt)}
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="size-3" />
              Updated {formatTimestamp(task.updatedAt)}
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}