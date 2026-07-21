import { useState } from "react"
import { useCreateBoard } from "@/hooks/use-boards"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { EmojiPicker } from "@/components/emoji-picker"
import type { Board } from "@/types"
import { cn } from "@/lib/utils"

interface CreateBoardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (board: Board) => void
}

export function CreateBoardDialog({ open, onOpenChange, onSuccess }: CreateBoardDialogProps) {
  const [name, setName] = useState("")
  const [identifier, setIdentifier] = useState("")
  const [icon, setIcon] = useState("⭐")
  const createBoard = useCreateBoard()

  const isValid = name.trim().length > 0 && /^[A-Z]{3}$/.test(identifier)

  const handleSubmit = () => {
    if (!isValid) return
    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
    createBoard.mutate(
      { name: name.trim(), slug, identifier, icon },
      {
        onSuccess: (board) => {
          onOpenChange(false)
          setName("")
          setIdentifier("")
          setIcon("⭐")
          onSuccess?.(board)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Board</DialogTitle>
          <DialogDescription>
            Create a new board with default lists (Backlog, To Do, In Progress,
            Review, Done).
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="board-name">Name</Label>
            <div className="flex gap-2">
              <EmojiPicker value={icon} onChange={setIcon} className="size-9 shrink-0 border border-border" />
              <Input
                id="board-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sprint 24"
                className="flex-1"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="board-identifier">Identifier</Label>
            <Input
              id="board-identifier"
              value={identifier}
              onChange={(e) =>
                setIdentifier(
                  e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3),
                )
              }
              maxLength={3}
              placeholder="ABC"
              className={cn(
                "font-mono",
                identifier.length > 0 && !/^[A-Z]{3}$/.test(identifier) && "border-destructive",
              )}
            />
            <p className="text-xs text-muted-foreground">
              3-letter prefix for task numbers (e.g., ABC → ABC-1)
            </p>
            {identifier.length > 0 && !/^[A-Z]{3}$/.test(identifier) && (
              <p className="text-xs text-destructive">
                Identifier must be exactly 3 letters
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || createBoard.isPending}
          >
            Create Board
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}