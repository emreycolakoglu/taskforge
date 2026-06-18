import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Columns3, Loader2 } from "lucide-react"
import { useBoards } from "@/hooks/use-boards"
import { Button } from "@/components/ui/button"
import { CreateBoardDialog } from "@/components/create-board-dialog"

export function HomePage() {
  const navigate = useNavigate()
  const { data: boards, isLoading } = useBoards()
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    if (boards && boards.length > 0) {
      navigate(`/board/${boards[0].id}`, { replace: true })
    }
  }, [boards, navigate])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (boards && boards.length > 0) {
    return null
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <Columns3 className="size-16 text-muted-foreground/30" />
      <h2 className="text-lg font-semibold">No boards yet</h2>
      <p className="text-sm text-muted-foreground">
        Create your first board to get started.
      </p>
      <Button onClick={() => setShowCreate(true)}>Create Board</Button>
      <CreateBoardDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onSuccess={(board) => navigate(`/board/${board.id}`)}
      />
    </div>
  )
}