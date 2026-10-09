/**
 * ProjectDocuments — the Documents tab of the project page (Projects v2).
 *
 * Lists the project's own documents (GET /api/projects/:id/documents) with
 * the board-documents-page row markup: D-number in mono, title, updated
 * date. Project docs carry no author (the Document model has none) and can't
 * be published, so neither column exists here. Rows open the global editor
 * route /doc/:docId — project docs have no board for the board-scoped one.
 *
 * "New document" is a title-only dialog; on success it opens the new doc in
 * the editor, like the board docs page. It is the tab's single Lime CTA —
 * the page hides its own "Add task" while this tab is active (design.md).
 * Delete sits behind the house AlertDialog confirm.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Trash2 } from 'lucide-react';
import {
  useProjectDocuments,
  useCreateProjectDocument,
  useDeleteDocument,
} from '@/hooks/use-documents';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const formatTimestamp = (ts: string) =>
  new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

export function ProjectDocuments({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const { data: documents = [] } = useProjectDocuments(projectId);
  const createDocument = useCreateProjectDocument();
  const deleteDocument = useDeleteDocument();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');

  const handleCreate = async () => {
    if (!title.trim()) return;
    try {
      const doc = await createDocument.mutateAsync({ projectId, title: title.trim() });
      setCreating(false);
      setTitle('');
      navigate(`/doc/${doc.id}`);
    } catch {
      // The hook toasts the failure; keep the dialog open to retry.
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-mono">{documents.length}</span>{' '}
          {documents.length === 1 ? 'document' : 'documents'}
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          New document
        </Button>
      </div>

      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="h-12 w-12 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-medium text-foreground">No documents yet</h2>
          <p className="text-sm text-muted-foreground">
            Create one to capture specs and notes for this project.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-1 rounded-md transition-colors hover:bg-accent"
            >
              <button
                type="button"
                onClick={() => navigate(`/doc/${doc.id}`)}
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left"
              >
                <span className="font-mono text-xs text-muted-foreground shrink-0">
                  {doc.docNumber}
                </span>
                <span className="flex-1 truncate text-sm text-foreground">{doc.title}</span>
                <span className="font-mono text-xs text-muted-foreground shrink-0">
                  {formatTimestamp(doc.updatedAt)}
                </span>
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mr-1 size-8 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${doc.title}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete document?</AlertDialogTitle>
                    <AlertDialogDescription>
                      "{doc.title}" will be permanently removed. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        deleteDocument.mutate({
                          id: doc.id,
                          boardId: null,
                          taskId: null,
                          projectId,
                        })
                      }
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={creating}
        onOpenChange={(open) => {
          setCreating(open);
          if (!open) setTitle('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New document</DialogTitle>
            <DialogDescription>Give it a title — you'll write the body next.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate();
            }}
          >
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title…"
              aria-label="Document title"
            />
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!title.trim() || createDocument.isPending}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
