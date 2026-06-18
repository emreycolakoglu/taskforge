import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { Task } from '../types';

export function useTasksByBoard(boardId: string) {
  return useQuery({
    queryKey: ['tasks', 'board', boardId],
    queryFn: () => api.tasks.list(boardId),
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ['tasks', id],
    queryFn: () => api.tasks.get(id),
  });
}

export function useSearchTasks(q: string) {
  return useQuery({
    queryKey: ['tasks', 'search', q],
    queryFn: () => api.tasks.search(q),
    enabled: q.length > 0,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof api.tasks.create>[0] & { boardId: string }) => {
      const { boardId: _boardId, ...taskData } = data;
      return api.tasks.create(taskData);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'board', variables.boardId] });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Task> }) =>
      api.tasks.update(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.id] });
    },
  });
}

export function useMoveTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data, boardId }: { id: string; data: { listId: string; position?: number }; boardId: string }) =>
      api.tasks.move(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'board', variables.boardId] });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, boardId }: { id: string; boardId: string }) =>
      api.tasks.delete(id),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'board', variables.boardId] });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
    },
  });
}