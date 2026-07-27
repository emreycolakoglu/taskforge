import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, LayoutGrid } from "lucide-react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { useSearchTasks } from "@/hooks/use-tasks";
import { useBoards } from "@/hooks/use-boards";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: tasks = [] } = useSearchTasks(query.trim());
  const { data: boards = [] } = useBoards();

  const filteredBoards = query.trim()
    ? boards.filter((b) =>
        b.name.toLowerCase().includes(query.toLowerCase()),
      )
    : [];

  const priorityColor = (p: string) => {
    switch (p) {
      case "urgent":
        return "text-destructive";
      case "high":
        return "text-[#eb5757]";
      case "medium":
        return "text-[#5e6ad2]";
      default:
        return "text-muted-foreground";
    }
  };

  const handleSelect = useCallback(
    (type: "task" | "board", id: string, boardId?: string) => {
      setOpen(false);
      setQuery("");
      if (type === "task" && boardId) {
        navigate(`/board/${boardId}/task/${id}`);
      } else {
        navigate(`/board/${id}`);
      }
    },
    [navigate],
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/60"
        onClick={() => setOpen(false)}
      />
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
        <div
          className="w-full max-w-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <Command
            shouldFilter={false}
            className="border border-graphite shadow-xl rounded-xl overflow-hidden"
          >
            <CommandInput
              ref={inputRef}
              placeholder="Search tasks and boards…"
              value={query}
              onValueChange={setQuery}
              className="h-11"
            />
            <CommandList className="max-h-80">
              <CommandEmpty>
                {query.trim()
                  ? "No results found"
                  : "Start typing to search"}
              </CommandEmpty>

              {tasks.length > 0 && (
                <CommandGroup heading="Tasks">
                  {tasks.map((task) => (
                    <CommandItem
                      key={task.id}
                      value={`${task.taskNumber} ${task.title}`}
                      onSelect={() =>
                        handleSelect("task", task.id, task.boardId)
                      }
                    >
                      <Search className="size-3.5 text-muted-foreground shrink-0" />
                      <span className="shrink-0 font-mono text-xs text-muted-foreground w-16">
                        {task.taskNumber}
                      </span>
                      <span className="truncate text-foreground flex-1 text-sm">
                        {task.title}
                      </span>
                      <span
                        className={cn(
                          "text-[11px] font-medium shrink-0",
                          priorityColor(task.priority),
                        )}
                      >
                        {task.priority}
                      </span>
                      {task.status?.name && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] shrink-0 bg-muted rounded-sm px-1.5 py-0.5 border-0"
                        >
                          {task.status.name}
                        </Badge>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {filteredBoards.length > 0 && (
                <CommandGroup heading="Boards">
                  {filteredBoards.map((board) => (
                    <CommandItem
                      key={board.id}
                      value={board.name}
                      onSelect={() => handleSelect("board", board.id)}
                    >
                      <LayoutGrid className="size-3.5 text-muted-foreground shrink-0" />
                      <span className="text-base leading-none shrink-0">
                        {board.icon ?? "⭐"}
                      </span>
                      <span className="truncate text-foreground flex-1 text-sm">
                        {board.name}
                      </span>
                      {board.identifier && (
                        <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                          {board.identifier}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </div>
      </div>
    </>
  );
}
