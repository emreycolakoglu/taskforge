import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
      toast.success("Task created");
      queryClient.invalidateQueries({ queryKey: ['tasks', 'board', variables.boardId] });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      queryClient.invalidateQueries({ queryKey: ['boards', variables.boardId, 'full'] });
    },
    onError: (error) => {
      toast.error("Failed to create task", { description: error.message });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data, boardId }: { id: string; data: Partial<Task>; boardId: string }) =>
      api.tasks.update(id, data),
    onSuccess: (_data, variables) => {
      toast.success("Task updated");
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'board', variables.boardId] });
      queryClient.invalidateQueries({ queryKey: ['boards', variables.boardId, 'full'] });
    },
    onError: (error) => {
      toast.error("Failed to update task", { description: error.message });
    },
  });
}

export function useMoveTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data, boardId }: { id: string; data: { statusId: string; position?: number }; boardId: string }) =>
      api.tasks.move(id, data),
    onSuccess: (_data, variables) => {
      toast.success("Task moved");
      queryClient.invalidateQueries({ queryKey: ['tasks', 'board', variables.boardId] });
      queryClient.invalidateQueries({ queryKey: ['boards', variables.boardId, 'full'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.id] });
    },
    onError: (error) => {
      toast.error("Failed to move task", { description: error.message });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, boardId }: { id: string; boardId: string }) =>
      api.tasks.delete(id),
    onSuccess: (_data, variables) => {
      toast.success("Task deleted");
      queryClient.invalidateQueries({ queryKey: ['tasks', 'board', variables.boardId] });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      queryClient.invalidateQueries({ queryKey: ['boards', variables.boardId, 'full'] });
    },
    onError: (error) => {
      toast.error("Failed to delete task", { description: error.message });
    },
  });
}