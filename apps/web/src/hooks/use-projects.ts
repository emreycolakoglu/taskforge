/**
 * use-projects — workspace-level Projects queries (Projects v2), mirroring
 * use-views.ts: one list query keyed ['projects'], one detail query keyed
 * ['projects', id], and create/update/remove mutations that each invalidate
 * the list on success. The list is invalidated with `exact: true` so a list
 * refresh doesn't prefix-sweep every cached detail; update/delete invalidate
 * the mutated row's detail key explicitly so the detail page stays fresh when
 * its own mutations run offline/WS-lost. Cache invalidation on live changes
 * rides the socket (project:created|updated|deleted → use-socket).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './api';
import type { ProjectStatus } from '../types';

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projects.list(),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => api.projects.get(id),
  });
}

export function useCreateProject() {
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
    }) => api.projects.create(data),
    onSuccess: () => {
      toast.success('Project created');
      queryClient.invalidateQueries({ queryKey: ['projects'], exact: true });
    },
    onError: (error) => {
      toast.error('Failed to create project', { description: error.message });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.projects.update>[1] }) =>
      api.projects.update(id, data),
    onSuccess: (_data, { id }) => {
      toast.success('Project updated');
      queryClient.invalidateQueries({ queryKey: ['projects'], exact: true });
      queryClient.invalidateQueries({ queryKey: ['projects', id] });
    },
    onError: (error) => {
      toast.error('Failed to update project', { description: error.message });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.projects.delete(id),
    onSuccess: (_data, id) => {
      toast.success('Project deleted');
      queryClient.invalidateQueries({ queryKey: ['projects'], exact: true });
      // The deleted detail goes stale-by-404; drop the cached row so a
      // lingering detail page refetches instead of trusting the cache.
      queryClient.invalidateQueries({ queryKey: ['projects', id] });
    },
    onError: (error) => {
      toast.error('Failed to delete project', { description: error.message });
    },
  });
}
