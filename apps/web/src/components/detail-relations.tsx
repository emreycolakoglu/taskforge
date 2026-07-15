/**
 * DetailRelations — three relation groups (Blocking / Blocked by / Related).
 *
 * Each group: heading + entries. Entries are compact border-defined rows with
 * mono task number + title + status pill + remove (×). "Add" uses a searchable
 * Popover (DetailAddRelationPopover) instead of the old Select — Select doesn't
 * scale and feels heavy for "add a relation".
 */

import { Button } from "@/components/ui/button";
import type { RelationEntry, RelationType, Task } from "@/types";
import { XIcon } from "lucide-react";
import { DetailAddRelationPopover } from "./detail-add-relation-popover";

interface DetailRelationsProps {
  relations?: RelationEntry[];
  taskId: string;
  boardId: string;
  boardTasks: Task[];
  onAdd: (
    otherTaskId: string,
    type: RelationType,
    direction?: "source" | "target",
  ) => void;
  onRemove: (relationId: string) => void;
  onNavigate: (id: string) => void;
  listType: "related_to" | "blocks-source" | "blocks-target";
}

export function DetailRelations({
  relations,
  taskId,
  boardId: _boardId,
  boardTasks,
  onAdd,
  onRemove,
  onNavigate,
  listType,
}: DetailRelationsProps) {
  const existingIds = new Set(relations?.map((e) => e.task.id));
  const excludeIds = new Set([taskId, ...existingIds]);

  return (
    <section id="relations" className="space-y-1 w-full max-w-full">
      {relations?.map((r) => (
        <div key={r.relationId} className="w-full flex gap-1 items-center">
          <Button
            variant={"ghost"}
            size="sm"
            className="flex w-full shrink rounded-xl text-left h-6 line-clamp-1 text-ellipsis"
            onClick={() => onNavigate(r.task.id)}
          >
            {r.task.title}
          </Button>
          <Button
            variant={"ghost"}
            size="icon"
            onClick={() => onRemove(r.relationId)}
            className="shrink-0 rounded-2xl p-0 h-6"
          >
            <XIcon />
          </Button>
        </div>
      ))}
      <div className="relative">
        <DetailAddRelationPopover
          boardTasks={boardTasks}
          excludeIds={excludeIds}
          onAdd={(id) =>
            onAdd(
              id,
              listType == "related_to" ? "related_to" : "blocks",
              listType == "related_to"
                ? undefined
                : listType == "blocks-source"
                  ? "source"
                  : "target",
            )
          }
        />
      </div>
    </section>
  );
}
