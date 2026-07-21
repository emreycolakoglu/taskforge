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
    onMutate: async (variables) => {
      const queryKey = ['tasks', 'board', variables.boardId];
      await queryClient.cancelQueries({ queryKey });

      const previousTasks = queryClient.getQueryData<Task[]>(queryKey);

      const optimisticTask: Task = {
        id: `optimistic-${Date.now()}`,
        statusId: variables.statusId,
        boardId: variables.boardId,
        number: 0,
        taskNumber: '',
        title: variables.title,
        description: variables.description ?? null,
        position: 999999,
        priority: (variables as any).priority ?? 'medium',
        doneAt: null,
        assigneeId: (variables as any).assigneeId ?? null,
        parentId: variables.parentId ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isOptimistic: true,
      };

      queryClient.setQueryData<Task[]>(queryKey, (old = []) => [...old, optimisticTask]);

      return { previousTasks, queryKey };
    },
    onError: (error, _variables, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(context.queryKey, context.previousTasks);
      }
      toast.error("Failed to create task", { description: error.message });
    },
    onSuccess: (data, variables) => {
      toast.success("Task created");
      // Replace the optimistic placeholder with the real task
      queryClient.setQueryData<Task[]>(
        ['tasks', 'board', variables.boardId],
        (old = []) => old.map((t) => (t.isOptimistic ? { ...data, isOptimistic: false } : t)),
      );
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      queryClient.invalidateQueries({ queryKey: ['boards', variables.boardId, 'full'] });
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

/**
 * Publish / unpublish a task.
 *
 * No success toast here on purpose: the caller owns it, because publishing also
 * copies the public URL to the clipboard and the toast should confirm that in
 * one message rather than firing two.
 */
export function useSetTaskPublic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isPublic }: { id: string; isPublic: boolean; boardId: string }) =>
      isPublic ? api.tasks.publish(id) : api.tasks.unpublish(id),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'board', variables.boardId] });
    },
    onError: (error) => {
      toast.error("Failed to change task visibility", { description: error.message });
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