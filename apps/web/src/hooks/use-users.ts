import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './api';

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => api.auth.users(),
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.auth.deleteUser(id),
    onSuccess: () => {
      toast.success("User deleted");
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => {
      toast.error("Failed to delete user", { description: error.message });
    },
  });
}

export function useInvites() {
  return useQuery({
    queryKey: ['invites'],
    queryFn: () => api.auth.invites(),
  });
}

export function useCreateInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.auth.createInvite(),
    onSuccess: () => {
      toast.success("Invite created");
      queryClient.invalidateQueries({ queryKey: ['invites'] });
    },
    onError: (error) => {
      toast.error("Failed to create invite", { description: error.message });
    },
  });
}

export function useRevokeInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.auth.revokeInvite(id),
    onSuccess: () => {
      toast.success("Invite revoked");
      queryClient.invalidateQueries({ queryKey: ['invites'] });
    },
    onError: (error) => {
      toast.error("Failed to revoke invite", { description: error.message });
    },
  });
}