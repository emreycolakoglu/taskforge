import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './api';
import { UpdateSettingsPayload } from '@/types';

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateSettingsPayload) => api.settings.update(data),
    onSuccess: () => {
      toast.success('Settings saved');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['attachment-policy'] });
    },
    onError: (error) => {
      toast.error('Failed to update settings', { description: error.message });
    },
  });
}

export function useSendTestEmail() {
  return useMutation({
    mutationFn: (to: string) => api.settings.sendTestEmail(to),
    onSuccess: () => {
      toast.success('Test email sent');
    },
    onError: (error) => {
      toast.error('Failed to send test email', { description: error.message });
    },
  });
}
