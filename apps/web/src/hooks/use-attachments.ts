import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Attachment, AttachmentSubjectType } from '../types';
import { api } from './api';

export interface AttachmentSubjectInput {
  subjectType: AttachmentSubjectType;
  subjectId: string;
  taskId?: string;
  documentId?: string;
}

export interface UploadAttachmentInput extends AttachmentSubjectInput {
  file: File;
}

export interface DeleteAttachmentInput extends AttachmentSubjectInput {
  id: string;
}

export function invalidateAttachmentSubject(
  queryClient: QueryClient,
  { subjectType, subjectId, taskId, documentId }: AttachmentSubjectInput,
): void {
  queryClient.invalidateQueries({ queryKey: ['attachments', subjectType, subjectId] });

  if (subjectType === 'task') {
    queryClient.invalidateQueries({ queryKey: ['tasks', subjectId] });
  }
  if (subjectType === 'comment' && taskId) {
    queryClient.invalidateQueries({ queryKey: ['comments', taskId] });
    queryClient.invalidateQueries({ queryKey: ['tasks', taskId] });
  }
  if (subjectType === 'document') {
    if (documentId) queryClient.invalidateQueries({ queryKey: ['documents', documentId] });
    if (taskId) queryClient.invalidateQueries({ queryKey: ['tasks', taskId] });
  }
}

export function useAttachments(subjectType: AttachmentSubjectType, subjectId: string) {
  return useQuery({
    queryKey: ['attachments', subjectType, subjectId],
    queryFn: () => api.attachments.list(subjectType, subjectId),
  });
}

export function useUploadAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ subjectType, subjectId, file }: UploadAttachmentInput) =>
      api.attachments.upload(subjectType, subjectId, file),
    onSuccess: (_attachment: Attachment, variables: UploadAttachmentInput) =>
      invalidateAttachmentSubject(queryClient, variables),
  });
}

export function useDeleteAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: DeleteAttachmentInput) => api.attachments.delete(id),
    onSuccess: (_result: void, variables: DeleteAttachmentInput) =>
      invalidateAttachmentSubject(queryClient, variables),
  });
}
