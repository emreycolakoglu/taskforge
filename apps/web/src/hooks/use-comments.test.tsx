/**
 * Tests for useUpdateComment + useReactToComment hooks (TFG-32).
 *
 * Verifies:
 * - useUpdateComment calls api.comments.update(id, body), fires "Comment updated"
 *   success toast, invalidates comments+tasks queries, error toast on failure.
 * - useReactToComment calls api.comments.react(id, emoji), fires NO success toast,
 *   invalidates comments+tasks queries, error toast on failure.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUpdate = vi.fn();
const mockReact = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('@/hooks/api', () => ({
  api: {
    comments: {
      update: (...args: any[]) => mockUpdate(...args),
      react: (...args: any[]) => mockReact(...args),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: any[]) => mockToastSuccess(...args),
    error: (...args: any[]) => mockToastError(...args),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

const TASK_ID = 'task-1';
const COMMENT_ID = 'comment-1';

describe('useUpdateComment (TFG-32)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls api.comments.update(id, body) and shows success toast', async () => {
    mockUpdate.mockResolvedValueOnce({ id: COMMENT_ID, body: 'edited' });
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    const { useUpdateComment } = await import('./use-comments');
    const { result } = renderHook(() => useUpdateComment(), { wrapper });

    await result.current.mutateAsync({ id: COMMENT_ID, body: 'edited', taskId: TASK_ID });

    expect(mockUpdate).toHaveBeenCalledWith(COMMENT_ID, 'edited');
    expect(mockToastSuccess).toHaveBeenCalledWith('Comment updated');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['comments', TASK_ID] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', TASK_ID] });
  });

  it('shows error toast on failure', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('Network error'));
    const { wrapper } = createWrapper();

    const { useUpdateComment } = await import('./use-comments');
    const { result } = renderHook(() => useUpdateComment(), { wrapper });

    await expect(
      result.current.mutateAsync({ id: COMMENT_ID, body: 'x', taskId: TASK_ID }),
    ).rejects.toThrow('Network error');

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to update comment', {
        description: 'Network error',
      });
    });
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });
});

describe('useReactToComment (TFG-32)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls api.comments.react(id, emoji), invalidates queries, fires NO success toast', async () => {
    mockReact.mockResolvedValueOnce({ id: COMMENT_ID, emoji: '👍' });
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    const { useReactToComment } = await import('./use-comments');
    const { result } = renderHook(() => useReactToComment(), { wrapper });

    await result.current.mutateAsync({ id: COMMENT_ID, emoji: '👍', taskId: TASK_ID });

    expect(mockReact).toHaveBeenCalledWith(COMMENT_ID, '👍');
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['comments', TASK_ID] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', TASK_ID] });
  });

  it('shows error toast on failure', async () => {
    mockReact.mockRejectedValueOnce(new Error('Network error'));
    const { wrapper } = createWrapper();

    const { useReactToComment } = await import('./use-comments');
    const { result } = renderHook(() => useReactToComment(), { wrapper });

    await expect(
      result.current.mutateAsync({ id: COMMENT_ID, emoji: '👍', taskId: TASK_ID }),
    ).rejects.toThrow('Network error');

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to toggle reaction', {
        description: 'Network error',
      });
    });
  });
});
