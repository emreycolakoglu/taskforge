import { useState, useCallback } from "react";
import { PlusIcon, Tag } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/hooks/api";
import { useLabels } from "@/hooks/use-labels";
import { useQueryClient } from "@tanstack/react-query";
import type { Task, TaskLabel } from "@/types";
import { LabelPill } from "./label-pill";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { LabelOptionList } from "./label-option-list";

interface LabelManagerProps {
  task: Task;
  boardId: string;
}

export function LabelManager({ task, boardId }: LabelManagerProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const { data: allLabels = [] } = useLabels(boardId);

  const currentLabelIds = new Set(
    (task.taskLabels ?? task.labels ?? []).map((tl: TaskLabel) => tl.labelId),
  );

  const toggle = useCallback(
    async (labelId: string) => {
      const isAttached = currentLabelIds.has(labelId);
      // Optimistic update
      setPending((prev) => new Set(prev).add(labelId));

      const queryKey = ["boards", boardId, "full"];
      // Snapshot current data for rollback
      const previous = queryClient.getQueryData(queryKey);

      // Optimistically update the board data
      queryClient.setQueryData(queryKey, (old: unknown) => {
        if (!old || typeof old !== "object" || old === null) return old;
        const board = old as Record<string, unknown>;
        const statuses = board.statuses as
          | Array<Record<string, unknown>>
          | undefined;
        if (!statuses) return old;

        return {
          ...board,
          statuses: statuses.map((status) => ({
            ...status,
            tasks: (status.tasks as Array<Record<string, unknown>>).map((t) => {
              if (t.id !== task.id) return t;
              const existingLabels = (t.taskLabels ??
                t.labels ??
                []) as TaskLabel[];
              if (isAttached) {
                return {
                  ...t,
                  taskLabels: existingLabels.filter(
                    (tl: TaskLabel) => tl.labelId !== labelId,
                  ),
                  labels: existingLabels.filter(
                    (tl: TaskLabel) => tl.labelId !== labelId,
                  ),
                };
              } else {
                const label = allLabels.find((l) => l.id === labelId);
                if (!label) return t;
                const newTL: TaskLabel = {
                  taskId: task.id,
                  labelId,
                  assignedAt: new Date().toISOString(),
                  label,
                };
                return {
                  ...t,
                  taskLabels: [...existingLabels, newTL],
                  labels: [...existingLabels, newTL],
                };
              }
            }),
          })),
        };
      });

      try {
        if (isAttached) {
          await api.labels.detach(task.id, labelId);
          toast.success("Label removed");
        } else {
          await api.labels.attach(task.id, labelId);
          toast.success("Label attached");
        }
      } catch (error) {
        // Rollback on error
        queryClient.setQueryData(queryKey, previous);
        toast.error(
          isAttached ? "Failed to remove label" : "Failed to attach label",
          {
            description:
              error instanceof Error ? error.message : "Unknown error",
          },
        );
      } finally {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(labelId);
          return next;
        });
        // Refetch to ensure consistency
        queryClient.invalidateQueries({ queryKey });
        queryClient.invalidateQueries({ queryKey: ["tasks", task.id] });
        queryClient.invalidateQueries({ queryKey: ["labels", boardId] });
      }
    },
    [
      task.id,
      task.taskLabels,
      task.labels,
      boardId,
      allLabels,
      currentLabelIds,
      queryClient,
    ],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-4 shrink-0"
          aria-label="Manage labels"
          onClick={(e) => e.stopPropagation()}
        >
          <PlusIcon className="size-3!" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-48 p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-xs font-medium text-muted-foreground mb-1.5">
          Labels
        </div>
        <LabelOptionList
          labels={allLabels}
          isSelected={(id) => currentLabelIds.has(id)}
          onToggle={toggle}
          isPending={(id) => pending.has(id)}
        />
      </PopoverContent>
    </Popover>
  );
}
