import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ListChecks } from 'lucide-react'
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
      case 'high': return 'text-orange-600 dark:text-orange-400'
      case 'medium': return 'text-indigo-600 dark:text-indigo-400'
      default: return 'text-muted-foreground'
    }
  }

  // Only show "no results" after a search has been performed with a non-empty query
  const searched = hasSearched && query.trim().length > 0

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Search across all boards
        </p>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tasks by title or description…"
          className="pl-9"
        />
      </div>

      {results.length > 0 && (
        <div className="border rounded-lg divide-y">
          {results.map((task) => {
            const board = task.boardId ? boards[task.boardId] : (task.list?.boardId ? boards[task.list.boardId] : undefined)
            return (
              <button
                key={task.id}
                type="button"
                className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
                onClick={() => {
                  if (board) navigate(`/board/${board.id}`)
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm truncate">
                    {task.taskNumber && (
                      <span className="text-muted-foreground font-normal mr-1">{task.taskNumber}</span>
                    )}
                    {task.title}
                  </span>
                  <span className={cn('text-xs font-semibold shrink-0', priorityColor(task.priority))}>
                    {task.priority}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {task.list && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {task.list.name}
                    </Badge>
                  )}
                  {board && (
                    <span className="text-xs text-muted-foreground">{board.name}</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {searched && results.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12">
          <ListChecks className="size-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No tasks found for "{query}"</p>
        </div>
      )}

      {!searched && !query.trim() && (
        <div className="flex flex-col items-center gap-2 py-12">
          <Search className="size-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Start typing to search tasks across all boards</p>
        </div>
      )}
    </div>
  )
}