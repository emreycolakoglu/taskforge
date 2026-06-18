import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './api';
import type { Board } from '../types';

export function useBoards() {
  return useQuery({
    queryKey: ['boards'],
    queryFn: () => api.boards.list(),
  });
}

export function useBoard(id: string) {
  return useQuery({
    queryKey: ['boards', id],
    queryFn: () => api.boards.get(id),
  });
}

export function useBoardFull(id: string) {
  return useQuery({
    queryKey: ['boards', id, 'full'],
    queryFn: () => api.boards.getFull(id),
  });
}

export function useCreateBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; slug: string; identifier: string; description?: string }) =>
      api.boards.create(data),
    onSuccess: () => {
      toast.success("Board created");
      queryClient.invalidateQueries({ queryKey: ['boards'] });
    },
    onError: (error) => {
      toast.error("Failed to create board", { description: error.message });
    },
  });
}

export function useUpdateBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Board> }) =>
      api.boards.update(id, data),
    onSuccess: (_data, variables) => {
      toast.success("Board updated");
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      queryClient.invalidateQueries({ queryKey: ['boards', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['boards', variables.id, 'full'] });
    },
    onError: (error) => {
      toast.error("Failed to update board", { description: error.message });
    },
  });
}

export function useDeleteBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.boards.delete(id),
    onSuccess: () => {
      toast.success("Board deleted");
      queryClient.invalidateQueries({ queryKey: ['boards'] });
    },
    onError: (error) => {
      toast.error("Failed to delete board", { description: error.message });
    },
  });
}