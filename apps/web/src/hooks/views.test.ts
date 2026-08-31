import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { View } from '@/types';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const viewRow = {
  id: 'v1',
  boardId: 'b1',
  userId: 'u1',
  isShared: true,
  name: 'Urgent',
  filters: JSON.stringify({ labelIds: [], searchQuery: 'x' }),
  groupBy: 'status',
  sortBy: 'position',
  layout: 'board',
  position: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: true, status, json: () => Promise.resolve(body) };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

describe('api.views', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn((k: string, v: string) => {
        store[k] = v;
      }),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists board views', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([viewRow]));

    const { api } = await import('./api');
    const views = await api.views.list('b1');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/boards/b1/views',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    expect(views).toHaveLength(1);
  });

  it('parses the filters JSON string into an object', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([viewRow]));

    const { api } = await import('./api');
    const views: View[] = await api.views.list('b1');

    expect(views[0].filters).toEqual({ labelIds: [], searchQuery: 'x' });
    expect(views[0].isShared).toBe(true);
    expect(views[0].userId).toBe('u1');
  });

  it('falls back to an empty filters object on invalid JSON', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([{ ...viewRow, filters: 'not json' }]));

    const { api } = await import('./api');
    const views: View[] = await api.views.list('b1');

    expect(views[0].filters).toEqual({});
  });

  it('gets a single view with parsed filters', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(viewRow));

    const { api } = await import('./api');
    const view = await api.views.get('v1');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/views/v1',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    expect(view.filters).toEqual({ labelIds: [], searchQuery: 'x' });
  });

  it('creates a view via POST /api/views', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(viewRow));

    const { api } = await import('./api');
    await api.views.create({
      boardId: 'b1',
      name: 'Urgent',
      filters: { labelIds: [] },
      shared: true,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/views',
      expect.objectContaining({ method: 'POST' }),
    );
    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({ boardId: 'b1', shared: true });
  });

  it('updates a view via PATCH and parses the response', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ...viewRow, name: 'Renamed' }));

    const { api } = await import('./api');
    const view = await api.views.update('v1', { name: 'Renamed' });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/views/v1',
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(view.name).toBe('Renamed');
  });

  it('deletes a view via DELETE', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204, json: () => Promise.resolve({}) });

    const { api } = await import('./api');
    await api.views.delete('v1');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/views/v1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});

describe('use-views hooks', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('useBoardViews fetches views for the board', async () => {
    mockFetch.mockResolvedValue(jsonResponse([viewRow]));

    const { useBoardViews } = await import('./use-views');
    const { result } = renderHook(() => useBoardViews('b1'), { wrapper: createWrapper().wrapper });

    await waitFor(() => {
      expect(result.current.data).toHaveLength(1);
    });
    expect(result.current.data![0].filters).toEqual({ labelIds: [], searchQuery: 'x' });
  });

  it('useCreateView toasts success and invalidates the views query', async () => {
    const { toast } = await import('sonner');
    mockFetch.mockResolvedValue(jsonResponse(viewRow));

    const { useCreateView } = await import('./use-views');
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData(['views', 'b1'], []);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateView('b1'), { wrapper });
    result.current.mutate({ name: 'Urgent', filters: { labelIds: [] }, shared: true });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('View saved');
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['views', 'b1'] });
    });
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/views',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('useUpdateView toasts error on failure', async () => {
    const { toast } = await import('sonner');
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('Bad name'),
    });

    const { useUpdateView } = await import('./use-views');
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUpdateView('b1'), { wrapper });
    result.current.mutate({ id: 'v1', data: { name: 'Bad name' } });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to update view', {
        description: 'Bad name',
      });
    });
  });

  it('useDeleteView invalidates the views query on success', async () => {
    const { toast } = await import('sonner');
    mockFetch.mockResolvedValue(jsonResponse({}));

    const { useDeleteView } = await import('./use-views');
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteView('b1'), { wrapper });
    result.current.mutate('v1');

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('View deleted');
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['views', 'b1'] });
    });
  });
});
