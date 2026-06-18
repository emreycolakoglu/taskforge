import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './api';
import type { Label } from '../types';

export function useLabels(boardId: string) {
  return useQuery({
    queryKey: ['labels', boardId],
    queryFn: () => api.labels.list(boardId),
  });
}

export function useCreateLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ boardId, ...data }: { boardId: string; name: string; color?: string }) =>
      api.labels.create(boardId, data),
    onSuccess: (_data, variables) => {
      toast.success("Label created");
      queryClient.invalidateQueries({ queryKey: ['labels', variables.boardId] });
      queryClient.invalidateQueries({ queryKey: ['boards', variables.boardId, 'full'] });
    },
    onError: (error) => {
      toast.error("Failed to create label", { description: error.message });
    },
  });
}

export function useUpdateLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data, boardId }: { id: string; data: Partial<Label>; boardId: string }) =>
      api.labels.update(id, data),
    onSuccess: (_data, variables) => {
      toast.success("Label updated");
      queryClient.invalidateQueries({ queryKey: ['labels', variables.boardId] });
      queryClient.invalidateQueries({ queryKey: ['boards', variables.boardId, 'full'] });
    },
    onError: (error) => {
      toast.error("Failed to update label", { description: error.message });
    },
  });
}

export function useDeleteLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, boardId }: { id: string; boardId: string }) =>
      api.labels.delete(id),
    onSuccess: (_data, variables) => {
      toast.success("Label deleted");
      queryClient.invalidateQueries({ queryKey: ['labels', variables.boardId] });
      queryClient.invalidateQueries({ queryKey: ['boards', variables.boardId, 'full'] });
    },
    onError: (error) => {
      toast.error("Failed to delete label", { description: error.message });
    },
  });
}