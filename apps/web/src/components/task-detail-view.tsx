/**
 * TaskDetailView — reusable task detail body (everything below the breadcrumb bar).
 *
 * Extracted from TaskDetailPage so the inbox right column (Task 10) can reuse the
 * same two-column layout (ScrollArea main + DetailPropertiesSidebar) without the
 * breadcrumb bar and prev/next navigation, which stay page-level concerns.
 *
 * Owns all data hooks + handlers it needs; callers only provide ids and an
 * optional onNavigateTask for parent/sub-task links.
 */

import { useCallback } from "react";
import {
  useTask,
  useUpdateTask,
  useTasksByBoard,
  useCreateTask,
} from "@/hooks/use-tasks";
import {
  useTaskRelations,
  useCreateRelation,
  useRemoveRelation,
} from "@/hooks/use-relations";
import { useBoardFull } from "@/hooks/use-boards";
import { useComments, useCreateComment } from "@/hooks/use-comments";
import { useUsers } from "@/hooks/use-users";
import { useLabels } from "@/hooks/use-labels";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DetailTitleBlock } from "@/components/detail-title-block";
import { DetailDescriptionEditor } from "@/components/detail-description-editor";
import { DetailSubIssues } from "@/components/detail-sub-issues";
import { DetailActivity } from "@/components/detail-activity";
import { DetailComments } from "@/components/detail-comments";
import { DetailPropertiesSidebar } from "@/components/detail-properties-sidebar";
import type { RelationType, Task } from "@/types";

interface TaskDetailViewProps {
  taskId: string;
  boardId: string;
  onNavigateTask?: (id: string) => void;
}

export function TaskDetailView({
  taskId,
  boardId,
  onNavigateTask,
}: TaskDetailViewProps) {
  const navigateToTask = onNavigateTask ?? ((id: string) => {});

  const { data: task } = useTask(taskId);
  const { data: board } = useBoardFull(boardId);
  const { data: comments = [] } = useComments(taskId);
  const { data: users = [] } = useUsers();
  const { data: _labels = [] } = useLabels(boardId);
  const { data: boardTasks = [] } = useTasksByBoard(boardId);

  const updateTask = useUpdateTask();
  const createComment = useCreateComment();
  const createTask = useCreateTask();
  const { data: relations } = useTaskRelations(taskId);
  const createRelation = useCreateRelation();
  const removeRelation = useRemoveRelation();

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleUpdate = useCallback(
    (data: Partial<Task>) => {
      if (!task || !boardId) return;
      updateTask.mutate({ id: task.id, boardId, data });
    },
    [task, boardId, updateTask],
  );

  const handleAddComment = useCallback(
    (body: string) => {
      if (!task) return;
      createComment.mutate({ taskId: task.id, author: "user", body });
    },
    [task, createComment],
  );

  const handleCreateSubTask = useCallback(
    (title: string) => {
      if (!task || !boardId) return;
      createTask.mutate({
        statusId: task.statusId,
        title,
        boardId,
        parentId: task.id,
      });
    },
    [task, boardId, createTask],
  );

  const handleAddRelation = useCallback(
    (
      otherTaskId: string,
      type: RelationType,
      direction?: "source" | "target",
    ) => {
      if (!task || !boardId) return;
      createRelation.mutate({
        taskId: task.id,
        boardId,
        otherTaskId,
        type,
        direction,
      });
    },
    [task, boardId, createRelation],
  );

  const handleRemoveRelation = useCallback(
    (relationId: string) => {
      if (!task || !boardId) return;
      removeRelation.mutate({ taskId: task.id, boardId, relationId });
    },
    [task, boardId, removeRelation],
  );

  const handleScrollTo = useCallback((anchor: string) => {
    document
      .getElementById(anchor)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (!task) return null;

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 min-h-0">
      {/* Main content column */}
      <ScrollArea className="flex-1">
        <div className="px-8 py-6 space-y-8 bg-background max-w-3xl">
          <DetailTitleBlock
            task={task}
            onSaveTitle={(title) => handleUpdate({ title })}
            onNavigateParent={navigateToTask}
          />

          <DetailDescriptionEditor
            value={task.description ?? ""}
            onSave={(description) => handleUpdate({ description })}
          />

          <DetailSubIssues
            task={task}
            boardId={boardId}
            onNavigate={navigateToTask}
            onCreateSubTask={handleCreateSubTask}
          />

          <DetailActivity
            activity={task.activity ?? []}
            formatTimestamp={formatTimestamp}
          />

          <DetailComments
            comments={comments}
            onSubmit={handleAddComment}
            formatTimestamp={formatTimestamp}
          />
        </div>
      </ScrollArea>

      {/* Right sidebar */}
      <DetailPropertiesSidebar
        task={task}
        board={board}
        users={users}
        boardTasks={boardTasks}
        relations={relations}
        onUpdate={handleUpdate}
        onAddRelation={handleAddRelation}
        onRemoveRelation={handleRemoveRelation}
        onNavigate={navigateToTask}
        onScrollTo={handleScrollTo}
        formatTimestamp={formatTimestamp}
      />
    </div>
  );
}
