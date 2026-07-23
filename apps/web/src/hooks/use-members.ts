import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './api';
import type { Member } from '../types';

export function useMembers(boardId: string) {
  return useQuery({
    queryKey: ['members', boardId],
    queryFn: () => api.members.list(boardId),
  });
}

export function useAddMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ boardId, userId, role }: { boardId: string; userId: string; role?: string }) =>
      api.members.add(boardId, { userId, role }),
    onSuccess: (_data, variables) => {
      toast.success('Member added');
      queryClient.invalidateQueries({ queryKey: ['members', variables.boardId] });
      queryClient.invalidateQueries({ queryKey: ['boards', variables.boardId, 'full'] });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
    },
    onError: (error) => {
      toast.error('Failed to add member', { description: error.message });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ boardId, userId }: { boardId: string; userId: string }) =>
      api.members.remove(boardId, userId),
    onSuccess: (_data, variables) => {
      toast.success('Member removed');
      queryClient.invalidateQueries({ queryKey: ['members', variables.boardId] });
      queryClient.invalidateQueries({ queryKey: ['boards', variables.boardId, 'full'] });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
    },
    onError: (error) => {
      toast.error('Failed to remove member', { description: error.message });
    },
  });
}

export function useJoinBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (boardId: string) => api.members.join(boardId),
    onSuccess: (_data, boardId) => {
      toast.success('Joined board');
      queryClient.invalidateQueries({ queryKey: ['members', boardId] });
      queryClient.invalidateQueries({ queryKey: ['boards', boardId, 'full'] });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
    },
    onError: (error) => {
      toast.error('Failed to join board', { description: error.message });
    },
  });
}

export function useLeaveBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (boardId: string) => api.members.leave(boardId),
    onSuccess: (_data, boardId) => {
      toast.success('Left board');
      queryClient.invalidateQueries({ queryKey: ['members', boardId] });
      queryClient.invalidateQueries({ queryKey: ['boards', boardId, 'full'] });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
    },
    onError: (error) => {
      toast.error('Failed to leave board', { description: error.message });
    },
  });
}
