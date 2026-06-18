import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
      queryClient.invalidateQueries({ queryKey: ['boards'] });
    },
  });
}

export function useUpdateBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Board> }) =>
      api.boards.update(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      queryClient.invalidateQueries({ queryKey: ['boards', variables.id] });
    },
  });
}

export function useDeleteBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.boards.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boards'] });
    },
  });
}