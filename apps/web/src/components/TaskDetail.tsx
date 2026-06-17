import { useState, useEffect } from 'react'
import { api } from '@/hooks/api'
import { Task, Label as LabelType } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface TaskDetailProps {
  task: Task
  onClose: () => void
  onUpdate: () => void
}

export function TaskDetail({ task, onClose, onUpdate }: TaskDetailProps) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description || '')
  const [priority, setPriority] = useState<string>(task.priority)
  const [assignee, setAssignee] = useState(task.assignee || '')
  const [comment, setComment] = useState('')
  const [labels, setLabels] = useState<LabelType[]>([])
  const [comments, setComments] = useState(task.comments || [])
  const [activity, setActivity] = useState(task.activity || [])

  useEffect(() => {
    api.labels.list(task.list?.boardId || '').then(setLabels).catch(() => {})
    api.comments.list(task.id).then(setComments).catch(() => {})
  }, [task.id, task.list?.boardId])

  const handleSave = async () => {
    await api.tasks.update(task.id, {
      title, description,
      priority: priority as any,
      assignee: assignee || undefined,
    })
    onUpdate()
  }

  const handleAddComment = async () => {
    if (!comment.trim()) return
    const c = await api.comments.create({ taskId: task.id, author: assignee || 'user', body: comment.trim() })
    setComments([c, ...comments])
    setComment('')
    onUpdate()
  }

  const priorityOptions = ['low', 'medium', 'high', 'urgent'] as const
  const priorityColors: Record<string, string> = {
    low: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    medium: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300',
    high: 'bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-300',
    urgent: 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300',
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0">
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
                      ? priorityColors[p]
                      : 'text-muted-foreground hover:bg-muted'
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
            {task.labels && task.labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {task.labels.map((tl) => (
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
                <TabsTrigger value="activity">Activity ({activity.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    placeholder="Add a description..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Assignee</label>
                  <Input
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    placeholder="User or agent ID..."
                  />
                </div>

                {task.dueDate && (
                  <p className="text-sm text-muted-foreground">
                    Due: {new Date(task.dueDate).toLocaleDateString()}
                  </p>
                )}

                <Separator />

                {/* Comments */}
                <div className="space-y-3">
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
                  <div className="space-y-3">
                    {comments.map((c) => (
                      <div key={c.id} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-indigo-500">{c.author}</span>
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
                <div className="space-y-3">
                  {activity.map((a) => (
                    <div key={a.id} className="text-sm">
                      <span className="font-semibold text-indigo-500">{a.actor}</span>
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
