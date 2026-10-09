import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useDocumentsByBoard,
  useCreateDocument,
  useProjectDocuments,
  useCreateProjectDocument,
  useDeleteDocument,
} from './use-documents';

const mockList = vi.fn();
const mockCreate = vi.fn();
const mockListByProject = vi.fn();
const mockCreateForProject = vi.fn();
const mockDelete = vi.fn();
vi.mock('@/hooks/api', () => ({
  api: {
    documents: {
      listByBoard: (...args: any[]) => mockList(...args),
      create: (...args: any[]) => mockCreate(...args),
      listByProject: (...args: any[]) => mockListByProject(...args),
      createForProject: (...args: any[]) => mockCreateForProject(...args),
      delete: (...args: any[]) => mockDelete(...args),
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

  it('lists documents for a project under its own key', async () => {
    mockListByProject.mockResolvedValueOnce([{ id: 'd1', title: 'Spec' }]);
    const { queryClient, wrapper } = createWrapper();
    const { result } = renderHook(() => useProjectDocuments('p1'), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'd1', title: 'Spec' }]));
    expect(mockListByProject).toHaveBeenCalledWith('p1');
    expect(queryClient.getQueryData(['documents', 'project', 'p1'])).toEqual([
      { id: 'd1', title: 'Spec' },
    ]);
  });

  it('creates a project document and refreshes the project list', async () => {
    mockCreateForProject.mockResolvedValueOnce({ id: 'd2', title: 'Spec' });
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateProjectDocument(), { wrapper });
    await result.current.mutateAsync({ projectId: 'p1', title: 'Spec' });
    expect(mockCreateForProject).toHaveBeenCalledWith('p1', { title: 'Spec' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['documents', 'project', 'p1'] });
  });

  it('deleting a project document refreshes the project list', async () => {
    mockDelete.mockResolvedValueOnce(undefined);
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteDocument(), { wrapper });
    await result.current.mutateAsync({ id: 'd1', boardId: null, taskId: null, projectId: 'p1' });
    expect(mockDelete).toHaveBeenCalledWith('d1');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['documents', 'project', 'p1'] });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['documents', 'board', null] });
  });
});
