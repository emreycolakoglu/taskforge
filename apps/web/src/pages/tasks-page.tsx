import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useBoards } from '@/hooks/use-boards'
import { useSearchTasks } from '@/hooks/use-tasks'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Global task search page — queries the search endpoint and lets users jump to a task's board */
export function TasksPage() {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  const { data: boardList = [] } = useBoards()
  const boards = Object.fromEntries(boardList.map((b) => [b.id, b]))

  const { data: results = [], isFetched: hasSearched } = useSearchTasks(query.trim())

  const priorityColor = (p: string) => {
    switch (p) {
      case 'urgent': return 'text-destructive'
      case 'high': return 'text-[#eb5757]'
      case 'medium': return 'text-[#5e6ad2]'
      default: return 'text-muted-foreground'
    }
  }

  // Only show "no results" after a search has been performed with a non-empty query
  const searched = hasSearched && query.trim().length > 0

  return (
    <div className="h-full overflow-y-auto bg-background p-6 space-y-4">
      <div>
        <h1 className="text-lg font-medium tracking-tight text-foreground">Tasks</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Search across all boards
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tasks by title or description…"
          className="pl-9"
        />
      </div>

      {results.length > 0 && (
        <div className="space-y-1">
          {results.map((task) => {
            const board = task.boardId ? boards[task.boardId] : (task.status?.boardId ? boards[task.status.boardId] : undefined)
            return (
              <button
                key={task.id}
                type="button"
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-accent cursor-pointer transition-colors border border-transparent hover:border-border text-left"
                onClick={() => {
                  if (board) navigate(`/board/${board.id}`)
                }}
              >
                <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">
                  {task.taskNumber}
                </span>
                <span className="text-sm text-foreground flex-1 truncate">
                  {task.title}
                </span>
                <span className={cn('text-xs font-semibold shrink-0', priorityColor(task.priority))}>
                  {task.priority}
                </span>
                {task.status && (
                  <Badge variant="secondary" className="text-xs text-muted-foreground bg-muted rounded-sm px-1.5 py-0.5 border-0">
                    {task.status.name}
                  </Badge>
                )}
                {board && (
                  <span className="text-xs text-muted-foreground shrink-0">{board.name}</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {searched && results.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-12">
          No tasks found for "{query}"
        </div>
      )}

      {!searched && !query.trim() && (
        <div className="text-sm text-muted-foreground text-center py-12">
          Start typing to search tasks across all boards
        </div>
      )}
    </div>
  )
}