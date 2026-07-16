/**
 * TaskDetailPage — Linear-style task detail view.
 *
 * Thin orchestrator: reads params, drives the breadcrumb bar (board name, prev/next
 * nav) and delegates the detail body to <TaskDetailView>. Loading / not-found and
 * prev/next navigation stay here; the two-column content + all data hooks for it
 * live in TaskDetailView.
 *
 * design.md compliance: no Lime CTA on the detail page (the screen's primary
 * action is editing, not creation). All Save/Submit buttons are outline/ghost.
 */

import { useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useTask, useTasksByBoard, useSetTaskPublic } from "@/hooks/use-tasks";
import { useBoardFull } from "@/hooks/use-boards";
import { Button } from "@/components/ui/button";
import { DetailBreadcrumbBar } from "@/components/detail-breadcrumb-bar";
import { TaskDetailView } from "@/components/task-detail-view";

export function TaskDetailPage() {
  const { boardId, taskId } = useParams<{ boardId: string; taskId: string }>();
  const navigate = useNavigate();

  const {
    data: task,
    isLoading: taskLoading,
    error: taskError,
  } = useTask(taskId!);
  const { data: board } = useBoardFull(boardId!);
  const { data: boardTasks = [] } = useTasksByBoard(boardId!);
  const setPublic = useSetTaskPublic();

  const handleSetPublic = useCallback(
    async (isPublic: boolean) => {
      await setPublic.mutateAsync({ id: taskId!, isPublic, boardId: boardId! });
    },
    [setPublic, taskId, boardId],
  );

  // ── Navigation: prev/next task ─────────────────────────────────────────────

  const sortedTasks = useMemo(
    () =>
      [...boardTasks].sort((a, b) =>
        (a.taskNumber ?? "").localeCompare(b.taskNumber ?? ""),
      ),
    [boardTasks],
  );

  const currentIndex = sortedTasks.findIndex((t) => t.id === taskId);
  const prevTask = currentIndex > 0 ? sortedTasks[currentIndex - 1] : null;
  const nextTask =
    currentIndex < sortedTasks.length - 1
      ? sortedTasks[currentIndex + 1]
      : null;

  const navigateToTask = useCallback(
    (id: string) => navigate(`/board/${boardId}/task/${id}`),
    [boardId, navigate],
  );

  // ── Loading / not-found ────────────────────────────────────────────────────

  if (taskLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-muted-foreground">Loading task…</div>
      </div>
    );
  }

  if (taskError || !task) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-background">
        <p className="text-destructive">Task not found.</p>
        <Button variant="outline" onClick={() => navigate(`/board/${boardId}`)}>
          <ArrowLeft className="size-4 mr-2" />
          Back to board
        </Button>
      </div>
    );
  }

  // ── Derived data ───────────────────────────────────────────────────────────

  const boardName = board?.name ?? "Board";
  const statusName =
    board?.statuses?.find((s) => s.id === task.statusId)?.name ??
    "Unknown status";

  const position = {
    current: currentIndex >= 0 ? currentIndex + 1 : 0,
    total: sortedTasks.length,
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-background">
      <DetailBreadcrumbBar
        boardName={boardName}
        statusName={statusName}
        taskNumber={task.taskNumber}
        taskId={task.id}
        boardId={boardId!}
        isPublic={task.isPublic ?? false}
        position={position}
        prevTask={prevTask ?? undefined}
        nextTask={nextTask ?? undefined}
        onBack={() => navigate(`/board/${boardId}`)}
        onNavigateTask={navigateToTask}
        onSetPublic={handleSetPublic}
      />

      <TaskDetailView
        taskId={taskId!}
        boardId={boardId!}
        onNavigateTask={navigateToTask}
      />
    </div>
  );
}
