import { useState } from 'react'
import { useTask, useUpdateTask } from '@/hooks/use-tasks'
import { useComments, useCreateComment } from '@/hooks/use-comments'
import { useLabels } from '@/hooks/use-labels'
import { useUsers } from '@/hooks/use-users'
import { Task } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface TaskDetailProps {
  task: Task
  onClose: () => void
}

export function TaskDetail({ task, onClose }: TaskDetailProps) {
  const { data: freshTask } = useTask(task.id)
  // Use fresh task data from react-query if available, fall back to prop
  const currentTask = freshTask ?? task
  const boardId = currentTask.list?.boardId ?? task.list?.boardId ?? ''

  const { data: labels = [] } = useLabels(boardId)
  const { data: comments = [] } = useComments(task.id)
  const { data: users = [] } = useUsers()

  const updateTask = useUpdateTask()
  const createComment = useCreateComment()

  const [title, setTitle] = useState(currentTask.title)
  const [description, setDescription] = useState(currentTask.description || '')
  const [priority, setPriority] = useState<string>(currentTask.priority)
  const [assigneeId, setAssigneeId] = useState<string>(currentTask.assigneeId ?? '__none__')
  const [comment, setComment] = useState('')

  const handleSave = () => {
    updateTask.mutate({
      id: task.id,
      data: {
        title,
        description,
        priority: priority as Task['priority'],
        assigneeId: assigneeId === '__none__' ? null : assigneeId,
      },
    })
  }

  const handleAddComment = () => {
    if (!comment.trim()) return
    const authorName = users.find(u => u.id === assigneeId)?.displayName || 'user'
    createComment.mutate(
      { taskId: task.id, author: authorName, body: comment.trim() },
      { onSuccess: () => setComment('') },
    )
  }

  const priorityOptions = ['low', 'medium', 'high', 'urgent'] as const
  const priorityPillClass = (p: string) => {
    if (priority !== p) return ''
    switch (p) {
      case 'urgent': return 'bg-destructive text-destructive-foreground'
      case 'high': return 'bg-orange-500 text-white'
      case 'medium': return 'bg-indigo-500 text-white'
      case 'low': return 'bg-muted text-muted-foreground'
      default: return ''
    }
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Task: {currentTask.title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col h-full max-h-[80vh]">
          {/* Header with priority + save */}
          <div className="flex items-center justify-between px-6 py-3 border-b shrink-0">
            <div className="flex gap-1.5">
              {priorityOptions.map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-semibold transition-colors",
                    priority === p
                      ? priorityPillClass(p)
                      : 'text-muted-foreground hover:bg-accent'
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
            <Button size="sm" onClick={handleSave}>Save</Button>
          </div>

          {/* Body */}
          <ScrollArea className="flex-1 px-6 py-4">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-xl font-bold border-0 px-0 shadow-none focus-visible:ring-0 mb-4"
            />

            {/* Labels */}
            {currentTask.labels && currentTask.labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {currentTask.labels.map((tl) => (
                  <Badge
                    key={tl.labelId}
                    style={{ backgroundColor: tl.label.color }}
                    className="text-white"
                  >
                    {tl.label.name}
                  </Badge>
                ))}
              </div>
            )}

            <Tabs defaultValue="details" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="activity">Activity ({currentTask.activity?.length ?? 0})</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="task-description" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</Label>
                  <Textarea
                    id="task-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    placeholder="Add a description..."
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="task-assignee" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Assignee</Label>
                  <Select value={assigneeId} onValueChange={setAssigneeId}>
                    <SelectTrigger id="task-assignee">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Unassigned</SelectItem>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.displayName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {currentTask.dueDate && (
                  <p className="text-sm text-muted-foreground">
                    Due: {new Date(currentTask.dueDate).toLocaleDateString()}
                  </p>
                )}

                <Separator />

                {/* Comments */}
                <div className="flex flex-col gap-3">
                  <h4 className="text-sm font-semibold">Comments ({comments.length})</h4>
                  <div className="flex gap-2">
                    <Input
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                      placeholder="Add a comment..."
                    />
                    <Button size="sm" onClick={handleAddComment}>Send</Button>
                  </div>
                  <div className="flex flex-col gap-3">
                    {comments.map((c) => (
                      <div key={c.id} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-primary">{c.author}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(c.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm">{c.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="activity">
                <div className="flex flex-col gap-3">
                  {currentTask.activity?.map((a) => (
                    <div key={a.id} className="text-sm">
                      <span className="font-semibold text-primary">{a.actor}</span>
                      {' '}{a.action}
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
                        } catch { return null }
                      })()}
                      <span className="float-right text-xs text-muted-foreground">
                        {new Date(a.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}