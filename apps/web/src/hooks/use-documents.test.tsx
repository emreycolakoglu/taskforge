import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDocumentsByBoard, useCreateDocument } from './use-documents';

const mockList = vi.fn();
const mockCreate = vi.fn();
vi.mock('@/hooks/api', () => ({
  api: {
    documents: {
      listByBoard: (...args: any[]) => mockList(...args),
      create: (...args: any[]) => mockCreate(...args),
    },
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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

describe('use-documents', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists documents for a board', async () => {
    mockList.mockResolvedValueOnce([{ id: 'd1', title: 'Doc' }]);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDocumentsByBoard('board-1'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'd1', title: 'Doc' }]));
    expect(mockList).toHaveBeenCalledWith('board-1');
  });

  it('creates a document and invalidates board/task queries', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'd2', title: 'New' });
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateDocument(), { wrapper });
    await result.current.mutateAsync({
      taskId: 't1',
      boardId: 'b1',
      title: 'New',
      body: '',
    });
    expect(mockCreate).toHaveBeenCalledWith('t1', { title: 'New', body: '' });
    expect(invalidate).toHaveBeenCalled();
  });
});
