import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './api';
import type { Document } from '../types';

export function useDocumentsByBoard(boardId: string) {
  return useQuery({
    queryKey: ['documents', 'board', boardId],
    queryFn: () => api.documents.listByBoard(boardId),
  });
}

export function useDocumentsByTask(taskId: string) {
  return useQuery({
    queryKey: ['documents', 'task', taskId],
    queryFn: () => api.documents.listByTask(taskId),
  });
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: ['documents', id],
    queryFn: () => api.documents.get(id),
  });
}

export function useCreateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { taskId: string; boardId: string; title: string; body?: string }) => {
      const { taskId, boardId, ...docData } = data;
      return api.documents.create(taskId, docData);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['documents', 'task', variables.taskId],
      });
      queryClient.invalidateQueries({
        queryKey: ['documents', 'board', variables.boardId],
      });
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.taskId] });
    },
    onError: (error) => {
      toast.error('Failed to create document', { description: error.message });
    },
  });
}

export function useUpdateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      id: string;
      boardId: string;
      taskId: string;
      title?: string;
      body?: string;
    }) => {
      const { id, boardId, taskId, ...update } = data;
      return api.documents.update(id, update);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['documents', variables.id] });
      queryClient.invalidateQueries({
        queryKey: ['documents', 'board', variables.boardId],
      });
      queryClient.invalidateQueries({
        queryKey: ['documents', 'task', variables.taskId],
      });
    },
    onError: (error) => {
      toast.error('Failed to update document', { description: error.message });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; boardId: string; taskId: string }) =>
      api.documents.delete(data.id),
    onSuccess: (_data, variables) => {
      toast.success('Document deleted');
      queryClient.invalidateQueries({
        queryKey: ['documents', 'board', variables.boardId],
      });
      queryClient.invalidateQueries({
        queryKey: ['documents', 'task', variables.taskId],
      });
    },
    onError: (error) => {
      toast.error('Failed to delete document', { description: error.message });
    },
  });
}

/** No success toast on purpose — the caller owns it (mirrors useSetTaskPublic). */
export function useSetDocumentPublic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; boardId: string; taskId: string; isPublic: boolean }) =>
      data.isPublic ? api.documents.publish(data.id) : api.documents.unpublish(data.id),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['documents', variables.id] });
      queryClient.invalidateQueries({
        queryKey: ['documents', 'board', variables.boardId],
      });
      queryClient.invalidateQueries({
        queryKey: ['documents', 'task', variables.taskId],
      });
    },
    onError: (error) => {
      toast.error('Failed to change document visibility', {
        description: error.message,
      });
    },
  });
}
