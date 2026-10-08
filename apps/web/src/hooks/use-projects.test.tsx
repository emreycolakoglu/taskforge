/**
 * use-projects mutation invalidation tests (TFG-34, Task 6 deferred finding).
 *
 * The detail-page query is keyed ['projects', id] — if update/delete only
 * invalidated the board list, the detail page would keep showing stale data
 * whenever its own mutations ran with the socket down. These tests spy on
 * queryClient.invalidateQueries and assert BOTH keys are invalidated.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('@/hooks/api', () => ({
  api: {
    projects: {
      update: vi.fn().mockResolvedValue({ id: 'p1', name: 'Roadmap' }),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

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

const BOARD_ID = 'b1';

describe('use-projects invalidation — update/delete also target the detail key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('useUpdateProject invalidates both the board list and the detail key', async () => {
    const { invalidateSpy, wrapper } = createWrapper();
    const { useUpdateProject } = await import('./use-projects');
    const { result } = renderHook(() => useUpdateProject(BOARD_ID), { wrapper });

    result.current.mutate({ id: 'p1', data: { name: 'Roadmap 2' } });

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith('Project updated');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects', BOARD_ID] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects', 'p1'] });
  });

  it('useDeleteProject invalidates both the board list and the detail key', async () => {
    const { invalidateSpy, wrapper } = createWrapper();
    const { useDeleteProject } = await import('./use-projects');
    const { result } = renderHook(() => useDeleteProject(BOARD_ID), { wrapper });

    result.current.mutate('p1');

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith('Project deleted');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects', BOARD_ID] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects', 'p1'] });
  });
});
