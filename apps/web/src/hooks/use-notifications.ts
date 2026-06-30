import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export function useNotifications(filter: 'unread' | 'all' = 'all') {
  return useQuery({
    queryKey: ['notifications', filter],
    queryFn: () => api.notifications.list(filter),
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.notifications.unreadCount(),
    refetchInterval: 30000,
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.notifications.markRead(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}