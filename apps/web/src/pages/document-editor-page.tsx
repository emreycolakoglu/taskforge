/**
 * DocumentEditorPage — full-page markdown editor for a document at
 * /board/:boardId/doc/:docId.
 *
 * Title edits inline and the body uses the same MarkdownEditor + autosave
 * stack as the task description (createAutosaver, flush on blur/unmount).
 * design.md: the only Lime on screen is the publish CTA; title/body keep the
 * Quiet action treatment. Delete is a destructive ghost in the header menu.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import {
  useDocument,
  useUpdateDocument,
  useDeleteDocument,
  useSetDocumentPublic,
} from '@/hooks/use-documents';
import { MarkdownEditor } from '@/components/markdown';
import { createAutosaver, type Autosaver } from '@/lib/autosave';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { toast } from 'sonner';

const AUTOSAVE_DELAY_MS = 1000;

export function DocumentEditorPage() {
  const { boardId, docId } = useParams<{ boardId: string; docId: string }>();
  const navigate = useNavigate();
  const { data: doc, isLoading } = useDocument(docId!);
  const updateDocument = useUpdateDocument();
  const deleteDocument = useDeleteDocument();
  const setPublic = useSetDocumentPublic();

  const [title, setTitle] = useState(doc?.title ?? '');
  const titleFocusedRef = useRef(false);
  useEffect(() => {
    if (titleFocusedRef.current) return;
    setTitle(doc?.title ?? '');
  }, [doc?.title]);

  const docRef = useRef(doc);
  docRef.current = doc;
  const saverRef = useRef<Autosaver<string> | null>(null);
  if (saverRef.current === null) {
    saverRef.current = createAutosaver<string>(
      (body) => {
        const d = docRef.current;
        if (d && body !== d.body) {
          updateDocument.mutate({
            id: d.id,
            boardId: d.boardId,
            taskId: d.taskId,
            body,
          });
        }
      },
      { delayMs: AUTOSAVE_DELAY_MS },
    );
  }
  useEffect(() => () => saverRef.current?.flush(), []);

  const saveTitle = useCallback(async () => {
    const d = docRef.current;
    if (!d || title.trim() === d.title) return;
    await updateDocument.mutateAsync({
      id: d.id,
      boardId: d.boardId,
      taskId: d.taskId,
      title: title.trim(),
    });
  }, [title, updateDocument]);

  const handlePublish = useCallback(async () => {
    const d = docRef.current;
    if (!d) return;
    await setPublic.mutateAsync({
      id: d.id,
      boardId: d.boardId,
      taskId: d.taskId,
      isPublic: !d.isPublic,
    });
    if (d.isPublic) {
      toast.success('Document is no longer public', {
        description: 'The public link now shows a not-found page.',
      });
      return;
    }
    if (!d.boardIdentifier) {
      toast.error('Could not build the public link', {
        description: 'This document is missing its board identifier.',
      });
      return;
    }
    const url = `${window.location.origin}/public/docs/${d.boardIdentifier}/${d.number}`;
    navigator.clipboard.writeText(url).then(
      () =>
        toast.success('Document published', {
          description: 'Public link copied to clipboard',
        }),
      () => toast.success('Document published', { description: url }),
    );
  }, [setPublic]);

  const handleDelete = useCallback(() => {
    const d = docRef.current;
    if (!d) return;
    deleteDocument.mutate(
      { id: d.id, boardId: d.boardId, taskId: d.taskId },
      { onSuccess: () => navigate(`/board/${boardId}/docs`) },
    );
  }, [deleteDocument, navigate, boardId]);

  if (isLoading || !doc) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex h-12 items-center justify-between border-b border-border bg-secondary px-6 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            asChild
          >
            <Link to={`/board/${boardId}/task/${doc.taskId}`}>
              <ArrowLeft className="size-4" />
              Back to task
            </Link>
          </Button>
          <span className="font-mono text-xs text-foreground">{doc.docNumber}</span>
          {doc.taskNumber && (
            <Link
              to={`/board/${boardId}/task/${doc.taskId}`}
              className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {doc.taskNumber}
            </Link>
          )}
          <Badge variant="outline" className="shrink-0 text-[10px] border-indigo/40 text-indigo">
            {doc.isPublic ? 'published' : 'private'}
          </Badge>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            onClick={handlePublish}
            title={doc.isPublic ? 'Make private' : 'Publish a public copy of this document'}
          >
            {doc.isPublic ? 'Make private' : 'Publish'}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-destructive"
                aria-label="Delete document"
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
                <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => {
              titleFocusedRef.current = true;
            }}
            onBlur={() => {
              titleFocusedRef.current = false;
              saveTitle();
            }}
            placeholder="Document title…"
            className="h-10 border-none bg-transparent px-0 text-2xl font-medium tracking-tight text-foreground focus-visible:ring-0"
            aria-label="Document title"
          />
          <MarkdownEditor
            value={doc.body}
            onChange={(body) => saverRef.current?.schedule(body)}
            onBlur={(body) => {
              saverRef.current?.schedule(body);
              saverRef.current?.flush();
            }}
          />
        </div>
      </main>
    </div>
  );
}
