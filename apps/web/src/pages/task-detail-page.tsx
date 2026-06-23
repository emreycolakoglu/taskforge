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
  Plus,
} from 'lucide-react'
import { useTask, useUpdateTask, useTasksByBoard, useCreateTask } from '@/hooks/use-tasks'
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
import { CreateTaskModal } from '@/components/create-task-modal'
import { cn } from '@/lib/utils'
import type { Task } from '@/types'

// ── Priority icons ──────────────────────────────────────────────────────────

function PriorityIcon({ priority }: { priority: Task['priority'] }) {
  switch (priority) {
    case 'urgent':
      return <AlertTriangle className="size-4 text-destructive" />
    case 'high':
      return <SignalHigh className="size-4 text-[#eb5757]" />
    case 'medium':
      return <SignalMedium className="size-4 text-[#5e6ad2]" />
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
        className="text-2xl font-medium tracking-tight text-foreground bg-input rounded-md border border-border px-2 py-1 -mx-2 outline-none w-full focus-visible:ring-2 focus-visible:ring-ring"
      />
    )
  }

  return (
    <h1
      className="text-2xl font-medium tracking-tight text-foreground cursor-text hover:bg-accent/50 rounded px-1 -mx-1"
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
        className="text-sm text-foreground/90 leading-relaxed cursor-text hover:bg-accent/50 rounded p-2 -mx-2 min-h-[80px]"
        onClick={() => {
          setDraft(value)
          setEditing(true)
        }}
      >
        {value || (
          <span className="italic text-muted-foreground">Add a description…</span>
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
  const createTask = useCreateTask()

  const [commentText, setCommentText] = useState('')
  const [showSubTaskModal, setShowSubTaskModal] = useState(false)

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
    <div className="flex h-full bg-background">
      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header bar */}
        <header className="bg-secondary border-b border-border px-6 py-3 flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to board"
            onClick={() => navigate(`/board/${boardId}`)}
          >
            <ArrowLeft className="size-4" />
          </Button>

          {task.taskNumber && (
            <span className="font-mono text-sm text-muted-foreground mr-1">
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
          <div className="p-6 space-y-6 bg-background max-w-3xl">
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

            {/* Sub-tasks */}
            <section>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                Sub-tasks
                {task.subTasks && task.subTasks.length > 0 && (
                  <span className="text-muted-foreground/70">({task.subTasks.length})</span>
                )}
              </h3>
              <div className="space-y-1.5">
                {(task.subTasks ?? []).map((st) => (
                  <div
                    key={st.id}
                    className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 cursor-pointer hover:bg-accent/50"
                    onClick={() => navigate(`/board/${boardId}/task/${st.id}`)}
                  >
                    {st.taskNumber && (
                      <span className="text-xs text-muted-foreground font-mono shrink-0">{st.taskNumber}</span>
                    )}
                    <span className="text-sm text-foreground truncate flex-1">{st.title}</span>
                    <Badge variant="secondary" className="text-[10px] shrink-0">{st.status}</Badge>
                  </div>
                ))}
                {(!task.subTasks || task.subTasks.length === 0) && (
                  <p className="text-sm text-muted-foreground italic">No sub-tasks</p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={() => setShowSubTaskModal(true)}
                >
                  <Plus className="size-3.5 mr-1" />
                  Add sub-task
                </Button>
              </div>
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
                    <div key={a.id} className="text-sm text-muted-foreground py-2 border-b border-border last:border-0 flex items-start gap-2">
                      <div className="size-5 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-[10px] font-semibold text-muted-foreground">
                          {a.actor.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="font-medium text-foreground">{a.actor}</span>{' '}
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
                        <span className="font-mono text-xs text-muted-foreground ml-2">
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
                  <div key={c.id} className="bg-card border border-border rounded-md p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{c.author}</span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {formatTimestamp(c.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-foreground/90 mt-1">{c.body}</p>
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
      <aside className="w-[280px] bg-secondary border-l border-border shrink-0 overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* Status */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
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
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
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
                        ? 'bg-[#eb5757]/10 text-[#eb5757]'
                        : p === 'high'
                        ? 'bg-[#eb5757]/10 text-[#eb5757]'
                        : p === 'medium'
                        ? 'bg-[#5e6ad2]/10 text-[#5e6ad2]'
                        : 'bg-muted text-muted-foreground'
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
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
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
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
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
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
                Due date
              </label>
              <div className="flex items-center gap-1.5 font-mono text-sm text-foreground">
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
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
              List
            </label>
            <div className="flex items-center gap-1.5 text-sm text-foreground">
              <ListChecks className="size-3.5 text-muted-foreground" />
              {listName}
            </div>
          </div>

          {/* Parent / sub-task link */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
              Parent
            </label>
            {task.parent ? (
              <button
                className="flex items-center gap-1.5 text-sm text-foreground hover:text-ring hover:underline"
                onClick={() => navigate(`/board/${boardId}/task/${task.parent!.id}`)}
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {task.parent.board?.identifier ? `${task.parent.board.identifier}-${task.parent.number}` : `#${task.parent.number}`}
                </span>
                <span className="truncate">{task.parent.title}</span>
              </button>
            ) : (
              <Select
                value={task.parentId ?? '__none__'}
                onValueChange={(v) => handleUpdate({ parentId: v === '__none__' ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No parent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unset</SelectItem>
                  {boardTasks
                    .filter((t) =>
                      t.id !== task.id
                      && !t.parentId
                      && !(task.subTasks && task.subTasks.length > 0)
                    )
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.taskNumber} {t.title}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="border-t border-border pt-4 space-y-2">
            {/* Timestamps */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
              <Clock className="size-3" />
              Created {formatTimestamp(task.createdAt)}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
              <Clock className="size-3" />
              Updated {formatTimestamp(task.updatedAt)}
            </div>
          </div>
        </div>
      </aside>

      {/* Sub-task creation modal */}
      {showSubTaskModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/30" onClick={() => setShowSubTaskModal(false)}>
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CreateTaskModal
              listId={task.listId}
              parentId={task.id}
              parentTaskNumber={task.taskNumber}
              onSubmit={(title) => {
                createTask.mutate(
                  { listId: task.listId, title, boardId: boardId!, parentId: task.id },
                  { onSuccess: () => setShowSubTaskModal(false) },
                )
              }}
              onClose={() => setShowSubTaskModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}