import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './api';
import type { RelationType } from '../types';

export function useTaskRelations(taskId: string) {
  return useQuery({
    queryKey: ['relations', taskId],
    queryFn: () => api.relations.list(taskId),
  });
}

export function useCreateRelation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, boardId, otherTaskId, type, direction }: {
      taskId: string;
      boardId: string;
      otherTaskId: string;
      type: RelationType;
      direction?: 'source' | 'target';
    }) => api.relations.create(taskId, { otherTaskId, type, direction }),
    onSuccess: (_data, variables) => {
      toast.success('Relation added');
      queryClient.invalidateQueries({ queryKey: ['relations', variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'board', variables.boardId] });
      queryClient.invalidateQueries({ queryKey: ['boards', variables.boardId, 'full'] });
    },
    onError: (error) => {
      toast.error('Failed to add relation', { description: error.message });
    },
  });
}

export function useRemoveRelation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, boardId, relationId }: {
      taskId: string;
      boardId: string;
      relationId: string;
    }) => api.relations.delete(taskId, relationId),
    onSuccess: (_data, variables) => {
      toast.success('Relation removed');
      queryClient.invalidateQueries({ queryKey: ['relations', variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'board', variables.boardId] });
      queryClient.invalidateQueries({ queryKey: ['boards', variables.boardId, 'full'] });
    },
    onError: (error) => {
      toast.error('Failed to remove relation', { description: error.message });
    },
  });
}