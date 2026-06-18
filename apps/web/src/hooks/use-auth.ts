import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export function useCurrentUser() {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: () => api.auth.me(),
  });
}