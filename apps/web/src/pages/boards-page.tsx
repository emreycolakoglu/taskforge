/**
 * BoardsPage — list all boards with Join/Leave buttons.
 *
 * Shows every board in the system. For each board, the current user can
 * join (if not a member) or leave (if a member). Board admins cannot leave
 * (they'd orphan the board). Clicking a board navigates to its kanban view.
 *
 * Mobile friendly: responsive grid that collapses to single column on small
 * screens, touch-friendly button targets.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, LogIn, LogOut, Columns3, Loader2 } from "lucide-react";
import { useBoards } from "@/hooks/use-boards";
import { useJoinBoard, useLeaveBoard } from "@/hooks/use-members";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateBoardDialog } from "@/components/create-board-dialog";
import type { Board } from "@/types";

export function BoardsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: boards, isLoading } = useBoards();
  const joinBoard = useJoinBoard();
  const leaveBoard = useLeaveBoard();
  const [showCreate, setShowCreate] = useState(false);

  const isMember = (board: Board) => {
    if (!user || !board.members) return false;
    return board.members.some((m) => m.userId === user.id);
  };

  const isAdmin = (board: Board) => {
    if (!user || !board.members) return false;
    return board.members.some((m) => m.userId === user.id && m.role === "admin");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <header className="shrink-0 border-b border-border px-4 sm:px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight text-foreground">
            Boards
          </h1>
          <p className="text-sm text-muted-foreground">
            All boards in the workspace
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="size-4 mr-2" />
          New Board
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {boards && boards.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {boards.map((board) => {
              const member = isMember(board);
              const admin = isAdmin(board);
              const memberCount = board.members?.length ?? board._count?.members ?? 0;

              return (
                <Card
                  key={board.id}
                  className="p-5 space-y-3 cursor-pointer hover:bg-accent/30 transition-colors"
                  onClick={() => navigate(`/board/${board.id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xl shrink-0">
                        {board.icon ?? "⭐"}
                      </span>
                      <div className="min-w-0">
                        <CardTitle className="text-sm text-foreground truncate">
                          {board.name}
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground mt-0.5">
                          {board.identifier && (
                            <span className="font-mono">{board.identifier}</span>
                          )}
                          {board.description && (
                            <span className="ml-1">· {board.description}</span>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                    {member && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] shrink-0 rounded-sm"
                      >
                        Member
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      {memberCount} member{memberCount !== 1 ? "s" : ""}
                    </span>
                    {board._count?.tasks !== undefined && (
                      <span>
                        {board._count.tasks} task{board._count.tasks !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>

                  <div
                    className="pt-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {member ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-muted-foreground"
                        disabled={admin || leaveBoard.isPending}
                        onClick={() => leaveBoard.mutate(board.id)}
                      >
                        <LogOut className="size-3.5 mr-1.5" />
                        {admin ? "Admin — can't leave" : "Leave"}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        disabled={joinBoard.isPending}
                        onClick={() => joinBoard.mutate(board.id)}
                      >
                        <LogIn className="size-3.5 mr-1.5" />
                        Join
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Columns3 className="h-12 w-12 text-muted-foreground" />
            <h2 className="text-lg font-medium text-foreground">
              No boards yet
            </h2>
            <p className="text-sm text-muted-foreground">
              Create your first board to get started.
            </p>
            <Button onClick={() => setShowCreate(true)}>Create Board</Button>
          </div>
        )}
      </div>

      <CreateBoardDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onSuccess={(board) => navigate(`/board/${board.id}`)}
      />
    </div>
  );
}
