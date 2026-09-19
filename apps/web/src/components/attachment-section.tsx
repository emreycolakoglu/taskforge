import { useRef } from 'react';
import { Archive, Download, File, FileText, Image, Paperclip, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import {
  useAttachmentPolicy,
  useAttachments,
  useDeleteAttachment,
  useUploadAttachment,
} from '@/hooks/use-attachments';
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
import type { Attachment, AttachmentPolicy, AttachmentSubjectType } from '@/types';

interface AttachmentSectionProps {
  subjectType: AttachmentSubjectType;
  subjectId: string;
  boardId: string;
  taskId?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelativeDate(value: string): string {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

function AttachmentIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('image/')) return <Image className="size-4" />;
  if (mimeType === 'application/zip') return <Archive className="size-4" />;
  if (mimeType.startsWith('text/') || mimeType === 'application/json') {
    return <FileText className="size-4" />;
  }
  return <File className="size-4" />;
}

export function validateAttachmentFile(
  file: File,
  settings?: AttachmentPolicy,
): string | undefined {
  const maxSize = settings?.maxFileSizeMb;
  if (maxSize && file.size > maxSize * 1024 * 1024) {
    return `File exceeds the ${maxSize} MB limit`;
  }
  const allowedMimeTypes = settings?.allowedMimeTypes;
  if (allowedMimeTypes && !allowedMimeTypes.includes(file.type)) {
    return `File type ${file.type || 'unknown'} is not allowed`;
  }
}

export function AttachmentSection({
  subjectType,
  subjectId,
  boardId,
  taskId,
}: AttachmentSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { data: members } = useMembers(boardId);
  const { data: attachmentPolicy } = useAttachmentPolicy();
  const { data: attachments = [], isLoading: isLoadingAttachments } = useAttachments(
    subjectType,
    subjectId,
  );
  const upload = useUploadAttachment();
  const remove = useDeleteAttachment();
  const member = members?.find((item) => item.userId === user?.id);
  const canUpload =
    user?.role === 'admin' ||
    (members !== undefined &&
      (members.length === 0 || (member !== undefined && member.role !== 'viewer')));

  const canDelete = (attachment: Attachment) =>
    user?.role === 'admin' || attachment.uploaderId === user?.id || member?.role === 'admin';

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    const error = validateAttachmentFile(file, attachmentPolicy);
    if (error) {
      toast.error(error);
      return;
    }
    upload.mutate(
      {
        subjectType,
        subjectId,
        boardId,
        taskId,
        documentId: subjectType === 'document' ? subjectId : undefined,
        file,
      },
      {
        onError: (error) =>
          toast.error('Failed to upload attachment', {
            description: error instanceof Error ? error.message : 'Please try again.',
          }),
      },
    );
  };

  return (
    <section id="attachments" className="space-y-3" aria-label="Attachments">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Paperclip className="size-3.5" />
          Attachments {attachments.length > 0 && `(${attachments.length})`}
        </h3>
        {canUpload && (
          <>
            <input
              ref={inputRef}
              id={`attachment-upload-${subjectType}-${subjectId}`}
              className="sr-only"
              type="file"
              onChange={(event) => {
                handleFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            <label className="sr-only" htmlFor={`attachment-upload-${subjectType}-${subjectId}`}>
              Upload attachment
            </label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={upload.isPending}
              onClick={() => inputRef.current?.click()}
            >
              {upload.isPending ? 'Uploading…' : 'Upload'}
            </Button>
          </>
        )}
      </div>

      {isLoadingAttachments ? (
        <p className="text-sm text-muted-foreground">Loading attachments…</p>
      ) : attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No attachments yet.</p>
      ) : (
        <div className="space-y-1.5">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
            >
              <span className="shrink-0 text-muted-foreground">
                <AttachmentIcon mimeType={attachment.mimeType} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{attachment.filename}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {formatSize(attachment.sizeBytes)} ·{' '}
                  {attachment.uploader?.displayName ?? 'Unknown'} ·{' '}
                  {formatRelativeDate(attachment.createdAt)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-foreground"
                aria-label={`Download ${attachment.filename}`}
                onClick={() =>
                  void api.attachments.download(attachment).catch((error) =>
                    toast.error('Failed to download attachment', {
                      description: error instanceof Error ? error.message : 'Please try again.',
                    }),
                  )
                }
              >
                <Download className="size-3.5" />
              </Button>
              {canDelete(attachment) && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      aria-label={`Delete ${attachment.filename}`}
                      disabled={remove.isPending}
                    >
                      <Trash2 className="size-3.5" />
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
                            {
                              id: attachment.id,
                              subjectType,
                              subjectId,
                              boardId,
                              taskId,
                              documentId: subjectType === 'document' ? subjectId : undefined,
                            },
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
      )}
    </section>
  );
}
