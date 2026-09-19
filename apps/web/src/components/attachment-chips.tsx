import { Download, File, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { useDeleteAttachment } from '@/hooks/use-attachments';
import { api } from '@/hooks/api';
import { useMembers } from '@/hooks/use-members';
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
import { Button } from '@/components/ui/button';
import type { Attachment } from '@/types';

interface AttachmentChipsProps {
  attachments: Attachment[];
  subjectId: string;
  boardId: string;
  taskId: string;
}

export function AttachmentChips({ attachments, subjectId, boardId, taskId }: AttachmentChipsProps) {
  const { user } = useAuth();
  const { data: members } = useMembers(boardId);
  const remove = useDeleteAttachment();
  const member = members?.find((item) => item.userId === user?.id);
  const canDelete = (attachment: Attachment) =>
    user?.role === 'admin' || attachment.uploaderId === user?.id || member?.role === 'admin';

  return (
    <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Comment attachments">
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="flex max-w-full items-center gap-1 rounded-md border border-border bg-card py-1 pr-1 pl-2 text-xs text-muted-foreground"
        >
          <File className="size-3 shrink-0" />
          <span className="truncate text-foreground">{attachment.filename}</span>
          <span className="font-mono text-muted-foreground">
            {formatSize(attachment.sizeBytes)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-5 text-muted-foreground hover:text-foreground"
            aria-label={`Download ${attachment.filename}`}
            onClick={() =>
              void api.attachments.download(attachment).catch((error) =>
                toast.error('Failed to download attachment', {
                  description: error instanceof Error ? error.message : 'Please try again.',
                }),
              )
            }
          >
            <Download className="size-3" />
          </Button>
          {canDelete(attachment) && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-5 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete ${attachment.filename}`}
                  disabled={remove.isPending}
                >
                  <Trash2 className="size-3" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete attachment?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This attachment will be permanently deleted. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={remove.isPending}
                    onClick={() =>
                      remove.mutate(
                        { id: attachment.id, subjectType: 'comment', subjectId, boardId, taskId },
                        {
                          onError: (error) =>
                            toast.error('Failed to delete attachment', {
                              description:
                                error instanceof Error ? error.message : 'Please try again.',
                            }),
                        },
                      )
                    }
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      ))}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
