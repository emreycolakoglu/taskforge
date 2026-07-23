/**
 * DetailSubIssues — inline sub-task list with add affordance.
 *
 * Heading + count badge, rows reuse task-card.tsx row styling (border-defined,
 * bg-card, hover:bg-accent/30). "Add sub-issue" renders QuickAddInput inline
 * in place of the add button when active (no full-screen modal overlay).
 *
 * "Add related" opens a CMDK-style search dialog that searches across
 * all boards by title or task number (e.g. "TFG-12"), letting the user select
 * an existing task to add as a related issue.
 */

import { useState, useCallback, useRef } from 'react'
import { Plus, Search, Link } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import { QuickAddInput } from './quick-add-input'
import { api } from '@/hooks/api'
import type { Task } from '@/types'

interface DetailSubIssuesProps {
  task: Task
  boardId: string
  onNavigate: (id: string) => void
  onCreateSubTask: (title: string) => void
  onAddRelation: (otherTaskId: string) => void
}

export function DetailSubIssues({ task, boardId: _boardId, onNavigate, onCreateSubTask, onAddRelation }: DetailSubIssuesProps) {
  const [adding, setAdding] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Task[]>([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const subTasks = task.subTasks ?? []
  const subTaskIds = new Set(subTasks.map((st) => st.id))

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!q.trim()) {
      setSearchResults([])
      return
    }

    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await api.tasks.search(q.trim())
        // Exclude the current task and its existing sub-tasks
        setSearchResults(results.filter((r) => r.id !== task.id && !subTaskIds.has(r.id)))
      } catch {
        // Silently fail — search is best-effort
      } finally {
        setSearching(false)
      }
    }, 300)
  }, [task.id, subTaskIds])

  const handleAddRelated = useCallback(async (selectedTaskId: string) => {
    try {
      onAddRelation(selectedTaskId)
      toast.success('Related issue added')
      setSearchOpen(false)
      setSearchQuery('')
      setSearchResults([])
    } catch (err) {
      toast.error('Failed to add related issue', { description: err instanceof Error ? err.message : undefined })
    }
  }, [onAddRelation])

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
          <QuickAddInput
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
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setAdding(true)}
            >
              <Plus className="size-3.5" />
              Add sub-issue
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setSearchOpen(true)}
            >
              <Link className="size-3.5" />
              Add related
            </Button>
          </div>
        )}
      </div>

      {/* CMDK search dialog for linking existing tasks */}
      <Dialog open={searchOpen} onOpenChange={(open) => {
        setSearchOpen(open)
        if (!open) {
          setSearchQuery('')
          setSearchResults([])
        }
      }}>
        <DialogContent className="p-0 gap-0 max-w-lg">
          <DialogHeader className="sr-only">
            <DialogTitle>Add related issue</DialogTitle>
          </DialogHeader>
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search by title or task number (e.g. TFG-12)..."
              value={searchQuery}
              onValueChange={handleSearch}
              autoFocus
            />
            <CommandList>
              <CommandEmpty>
                {searching ? 'Searching...' : searchQuery ? 'No tasks found' : 'Type to search tasks'}
              </CommandEmpty>
              {searchResults.length > 0 && (
                <CommandGroup heading="Results">
                  {searchResults.map((result) => (
                    <CommandItem
                      key={result.id}
                      value={`${result.taskNumber ?? ''} ${result.title}`}
                      onSelect={() => handleAddRelated(result.id)}
                    >
                      <Search className="size-3.5 text-muted-foreground shrink-0" />
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {result.taskNumber}
                      </span>
                      <span className="truncate text-foreground flex-1">{result.title}</span>
                      {result.status?.name && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          {result.status.name}
                        </Badge>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </section>
  )
}
