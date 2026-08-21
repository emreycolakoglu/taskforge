/**
 * DetailDocuments — the task's documents on the detail page.
 *
 * Heading + count, flat list of rows (title + D-number), each linking to the
 * full-page editor at /board/:boardId/doc/:docId. "New document" opens an
 * inline title input and navigates on create.
 *
 * design.md: no Lime here (the detail page's one Lime is the top CTA on the
 * board; this list is a quiet utility section).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useDocumentsByTask, useCreateDocument } from "@/hooks/use-documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface DetailDocumentsProps {
  taskId: string;
  boardId: string;
}

export function DetailDocuments({ taskId, boardId }: DetailDocumentsProps) {
  const navigate = useNavigate();
  const { data: documents = [] } = useDocumentsByTask(taskId);
  const createDocument = useCreateDocument();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");

  const handleCreate = async () => {
    if (!title.trim()) return;
    try {
      const doc = await createDocument.mutateAsync({
        taskId,
        boardId,
        title: title.trim(),
      });
      setAdding(false);
      setTitle("");
      navigate(`/board/${boardId}/doc/${doc.id}`);
    } catch {
      // Keep the form open so the user can correct and retry.
      toast.error("Failed to create document", {
        description: "Please try again.",
      });
    }
  };

  return (
    <section id="documents" className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        Documents
        {documents.length > 0 && (
          <span className="text-muted-foreground/70">({documents.length})</span>
        )}
      </h3>
      <div className="space-y-1.5">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 cursor-pointer hover:bg-accent/30 transition-colors"
            onClick={() => navigate(`/board/${boardId}/doc/${doc.id}`)}
          >
            <span className="font-mono text-xs text-muted-foreground shrink-0">
              {doc.docNumber}
            </span>
            <span className="text-sm text-foreground truncate flex-1">
              {doc.title}
            </span>
            {doc.isPublic && (
              <Badge
                variant="outline"
                className="text-[10px] shrink-0 border-indigo/40 text-indigo"
              >
                public
              </Badge>
            )}
          </div>
        ))}
        {documents.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground italic">No documents</p>
        )}
        {adding ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              onBlur={() => setAdding(false)}
              placeholder="Document title…"
            />
            <Button
              size="sm"
              variant="outline"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleCreate}
            >
              Create
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setAdding(true)}
          >
            <Plus className="size-3.5" />
            New document
          </Button>
        )}
      </div>
    </section>
  );
}
