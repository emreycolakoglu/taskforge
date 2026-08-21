import { useNavigate } from "react-router-dom";
import { FileText, Plus } from "lucide-react";
import { useState } from "react";
import { useBoardFull } from "@/hooks/use-boards";
import { useDocumentsByBoard, useCreateDocument } from "@/hooks/use-documents";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Document } from "@/types";

/**
 * BoardDocumentsPage — per-board document index at /board/:boardId/docs.
 *
 * Lists every document on the board (title, D-number, linked task, updated
 * timestamp, published state) and offers a single "New document" CTA (the
 * screen's one Lime action per design.md). Creating a doc requires picking a
 * task — the inline form lists tasks from the board.
 */
export function BoardDocumentsPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const { data: board } = useBoardFull(boardId!);
  const { data: documents = [] } = useDocumentsByBoard(boardId!);
  const createDocument = useCreateDocument();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [taskId, setTaskId] = useState("");

  const handleCreate = async () => {
    if (!title.trim() || !taskId) return;
    const doc = await createDocument.mutateAsync({
      taskId,
      boardId: boardId!,
      title: title.trim(),
    });
    setCreating(false);
    setTitle("");
    setTaskId("");
    navigate(`/board/${boardId}/doc/${doc.id}`);
  };

  const formatTimestamp = (ts: string) =>
    new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="shrink-0 border-b border-border px-4 sm:px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight text-foreground">
            {board?.icon ?? "⭐"} {board?.name ?? "Board"} — Documents
          </h1>
          <p className="text-sm text-muted-foreground">
            All documents on this board
          </p>
        </div>
        <Button onClick={() => setCreating((v) => !v)}>
          <Plus className="size-4 mr-2" />
          New document
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {creating && (
          <div className="mb-4 flex flex-col gap-2 rounded-md border border-border bg-card p-3">
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title…"
            />
            <select
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              className="rounded-md border border-border bg-input px-3 py-2 text-sm"
            >
              <option value="">Attach to a task…</option>
              {(board?.statuses ?? [])
                .flatMap((s) => s.tasks ?? [])
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.taskNumber ?? t.title}
                  </option>
                ))}
            </select>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={createDocument.isPending}
              >
                Create
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCreating(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {documents.length === 0 && !creating ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FileText className="h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-medium text-foreground">
              No documents yet
            </h2>
            <p className="text-sm text-muted-foreground">
              Create one to capture notes on a task.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {documents.map((doc: Document) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => navigate(`/board/${boardId}/doc/${doc.id}`)}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent"
              >
                <span className="font-mono text-xs text-muted-foreground shrink-0">
                  {doc.docNumber}
                </span>
                <span className="flex-1 truncate text-sm text-foreground">
                  {doc.title}
                </span>
                {doc.taskNumber && (
                  <span className="font-mono text-xs text-muted-foreground shrink-0">
                    {doc.taskNumber}
                  </span>
                )}
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatTimestamp(doc.updatedAt)}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                  {doc.isPublic ? "published" : "private"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
