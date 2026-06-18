import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './api';

export function useComments(taskId: string) {
  return useQuery({
    queryKey: ['comments', taskId],
    queryFn: () => api.comments.list(taskId),
  });
}

export function useCreateComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { taskId: string; author: string; body: string }) =>
      api.comments.create(data),
    onSuccess: (_data, variables) => {
      toast.success("Comment added");
      queryClient.invalidateQueries({ queryKey: ['comments', variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.taskId] });
    },
    onError: (error) => {
      toast.error("Failed to create comment", { description: error.message });
    },
  });
}

export function useDeleteComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, taskId }: { id: string; taskId: string }) =>
      api.comments.delete(id),
    onSuccess: (_data, variables) => {
      toast.success("Comment deleted");
      queryClient.invalidateQueries({ queryKey: ['comments', variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.taskId] });
    },
    onError: (error) => {
      toast.error("Failed to delete comment", { description: error.message });
    },
  });
}