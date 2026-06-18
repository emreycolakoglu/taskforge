import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
    mutationFn: (data: { boardId: string; name: string; color?: string }) =>
      api.labels.create(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['labels', variables.boardId] });
    },
  });
}

export function useUpdateLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data, boardId }: { id: string; data: Partial<Label>; boardId: string }) =>
      api.labels.update(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['labels', variables.boardId] });
    },
  });
}

export function useDeleteLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, boardId }: { id: string; boardId: string }) =>
      api.labels.delete(id),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['labels', variables.boardId] });
    },
  });
}