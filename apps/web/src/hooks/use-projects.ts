/**
 * use-projects — board-scoped Projects queries (TFG-34), mirroring
 * use-views.ts: one list query keyed ['projects', boardId], one detail
 * query keyed ['projects', id], and create/update/remove mutations that
 * each invalidate the board list on success. Update/delete also invalidate
 * the mutated row's detail key so the detail page stays fresh when its own
 * mutations run offline/WS-lost. Cache invalidation on live changes rides
 * the socket (project:created|updated|deleted → use-socket).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './api';
import type { ProjectStatus } from '../types';

export function useProjects(boardId: string) {
  return useQuery({
    queryKey: ['projects', boardId],
    queryFn: () => api.projects.list(boardId),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => api.projects.get(id),
  });
}

export function useCreateProject(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      icon?: string;
      leadId?: string;
      status?: ProjectStatus;
      startDate?: string;
      targetDate?: string;
    }) => api.projects.create({ ...data, boardId }),
    onSuccess: () => {
      toast.success('Project created');
      queryClient.invalidateQueries({ queryKey: ['projects', boardId] });
    },
    onError: (error) => {
      toast.error('Failed to create project', { description: error.message });
    },
  });
}

export function useUpdateProject(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.projects.update>[1] }) =>
      api.projects.update(id, data),
    onSuccess: (_data, { id }) => {
      toast.success('Project updated');
      queryClient.invalidateQueries({ queryKey: ['projects', boardId] });
      queryClient.invalidateQueries({ queryKey: ['projects', id] });
    },
    onError: (error) => {
      toast.error('Failed to update project', { description: error.message });
    },
  });
}

export function useDeleteProject(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.projects.delete(id),
    onSuccess: (_data, id) => {
      toast.success('Project deleted');
      queryClient.invalidateQueries({ queryKey: ['projects', boardId] });
      // The deleted detail goes stale-by-404; drop the cached row so a
      // lingering detail page refetches instead of trusting the cache.
      queryClient.invalidateQueries({ queryKey: ['projects', id] });
    },
    onError: (error) => {
      toast.error('Failed to delete project', { description: error.message });
    },
  });
}
