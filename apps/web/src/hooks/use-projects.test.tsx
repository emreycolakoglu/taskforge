/**
 * use-projects tests (Projects v2 — workspace-level projects).
 *
 * The list is keyed ['projects'] (no board) and the detail ['projects', id].
 * Mutations invalidate the list with `exact: true` (so they don't sweep every
 * cached detail by prefix) plus the mutated row's own detail key, so the
 * detail page stays fresh when its own mutations run with the socket down.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

const mockApi = vi.hoisted(() => ({
  projects: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 'p9', name: 'New' }),
    update: vi.fn().mockResolvedValue({ id: 'p1', name: 'Roadmap' }),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/hooks/api', () => ({ api: mockApi }));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  return {
    queryClient,
    invalidateSpy,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

const LIST_KEY = { queryKey: ['projects'], exact: true };

describe('use-projects — workspace-level keys (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('useProjects lists every project under the global ["projects"] key', async () => {
    const { queryClient, wrapper } = createWrapper();
    const { useProjects } = await import('./use-projects');
    const { result } = renderHook(() => useProjects(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.projects.list).toHaveBeenCalledWith();
    expect(queryClient.getQueryData(['projects'])).toEqual([]);
  });

  it('useCreateProject posts without a boardId and invalidates the list', async () => {
    const { invalidateSpy, wrapper } = createWrapper();
    const { useCreateProject } = await import('./use-projects');
    const { result } = renderHook(() => useCreateProject(), { wrapper });

    result.current.mutate({ name: 'New' });

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Project created'));
    expect(mockApi.projects.create).toHaveBeenCalledWith({ name: 'New' });
    expect(invalidateSpy).toHaveBeenCalledWith(LIST_KEY);
  });

  it('useUpdateProject invalidates both the list and the detail key', async () => {
    const { invalidateSpy, wrapper } = createWrapper();
    const { useUpdateProject } = await import('./use-projects');
    const { result } = renderHook(() => useUpdateProject(), { wrapper });

    result.current.mutate({ id: 'p1', data: { name: 'Roadmap 2' } });

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Project updated'));
    expect(invalidateSpy).toHaveBeenCalledWith(LIST_KEY);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects', 'p1'] });
  });

  it('useDeleteProject invalidates both the list and the detail key', async () => {
    const { invalidateSpy, wrapper } = createWrapper();
    const { useDeleteProject } = await import('./use-projects');
    const { result } = renderHook(() => useDeleteProject(), { wrapper });

    result.current.mutate('p1');

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Project deleted'));
    expect(invalidateSpy).toHaveBeenCalledWith(LIST_KEY);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects', 'p1'] });
  });
});
