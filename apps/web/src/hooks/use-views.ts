import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './api';
import type { ViewFilters } from '../types';

export function useBoardViews(boardId: string) {
  return useQuery({
    queryKey: ['views', boardId],
    queryFn: () => api.views.list(boardId),
  });
}

export function useCreateView(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      filters: ViewFilters;
      groupBy?: string;
      sortBy?: string;
      layout?: string;
      shared: boolean;
      position?: number;
    }) => api.views.create({ ...data, boardId }),
    onSuccess: () => {
      toast.success('View saved');
      queryClient.invalidateQueries({ queryKey: ['views', boardId] });
    },
    onError: (error) => {
      toast.error('Failed to save view', { description: error.message });
    },
  });
}

export function useUpdateView(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.views.update>[1] }) =>
      api.views.update(id, data),
    onSuccess: () => {
      toast.success('View updated');
      queryClient.invalidateQueries({ queryKey: ['views', boardId] });
    },
    onError: (error) => {
      toast.error('Failed to update view', { description: error.message });
    },
  });
}

export function useDeleteView(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.views.delete(id),
    onSuccess: () => {
      toast.success('View deleted');
      queryClient.invalidateQueries({ queryKey: ['views', boardId] });
    },
    onError: (error) => {
      toast.error('Failed to delete view', { description: error.message });
    },
  });
}
