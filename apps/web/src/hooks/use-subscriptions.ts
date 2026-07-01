import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export function useSubscription(taskId: string | undefined) {
  return useQuery({
    queryKey: ['subscriptions', taskId],
    queryFn: () => api.subscriptions.get(taskId!),
    enabled: !!taskId,
  });
}

export function useSubscribe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.subscriptions.create(taskId),
    onSuccess: (_data, taskId) => {
      queryClient.setQueryData(['subscriptions', taskId], { subscribed: true });
    },
  });
}

export function useUnsubscribe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.subscriptions.delete(taskId),
    onSuccess: (_data, taskId) => {
      queryClient.setQueryData(['subscriptions', taskId], { subscribed: false });
    },
  });
}