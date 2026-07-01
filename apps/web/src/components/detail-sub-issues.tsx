/**
 * DetailSubIssues — inline sub-task list with add affordance.
 *
 * Heading + count badge, rows reuse task-card.tsx row styling (border-defined,
 * bg-card, hover:bg-accent/30). "Add sub-issue" renders CreateTaskModal inline
 * in place of the add button when active (no full-screen modal overlay).
 */

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CreateTaskModal } from './create-task-modal'
import type { Task } from '@/types'

interface DetailSubIssuesProps {
  task: Task
  boardId: string
  onNavigate: (id: string) => void
  onCreateSubTask: (title: string) => void
}

export function DetailSubIssues({ task, boardId: _boardId, onNavigate, onCreateSubTask }: DetailSubIssuesProps) {
  const [adding, setAdding] = useState(false)
  const subTasks = task.subTasks ?? []

  return (
    <section id="sub-issues" className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        Sub-issues
        {subTasks.length > 0 && (
          <span className="text-muted-foreground/70">({subTasks.length})</span>
        )}
      </h3>
      <div className="space-y-1.5">
        {subTasks.map((st) => (
          <div
            key={st.id}
            className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 cursor-pointer hover:bg-accent/30"
            onClick={() => onNavigate(st.id)}
          >
            {st.taskNumber && (
              <span className="text-xs text-muted-foreground font-mono shrink-0">{st.taskNumber}</span>
            )}
            <span className="text-sm text-foreground truncate flex-1">{st.title}</span>
            <Badge variant="secondary" className="text-[10px] shrink-0">{st.status?.name ?? '—'}</Badge>
          </div>
        ))}
        {subTasks.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground italic">No sub-issues</p>
        )}
        {adding ? (
          <CreateTaskModal
            statusId={task.statusId}
            parentId={task.id}
            parentTaskNumber={task.taskNumber}
            onSubmit={(title) => {
              onCreateSubTask(title)
              setAdding(false)
            }}
            onClose={() => setAdding(false)}
          />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setAdding(true)}
          >
            <Plus className="size-3.5" />
            Add sub-issue
          </Button>
        )}
      </div>
    </section>
  )
}