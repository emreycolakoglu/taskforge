import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement, useEffect } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useActiveView } from './use-view-state';
import type { View } from '@/types';

const mockView: View = {
  id: 'v1',
  boardId: 'b1',
  userId: 'u1',
  isShared: true,
  name: 'Urgent only',
  filters: { priorities: ['urgent'] },
  groupBy: 'status',
  sortBy: 'position',
  layout: 'board',
  position: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('./use-views', () => ({
  useBoardViews: vi.fn(() => viewsQueryOverride.current ?? { data: [mockView], isPending: false }),
  useCreateView: vi.fn(() => ({ mutate: vi.fn() })),
  useUpdateView: vi.fn(() => ({ mutate: vi.fn() })),
  useDeleteView: vi.fn(() => ({ mutate: vi.fn() })),
}));

// Overridden per-test to control the views query state (e.g. loading).
const viewsQueryOverride: { current: { data: View[]; isPending: boolean } | null } = {
  current: null,
};

function makeWrapper(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let locationRef: { search: string } | null = null;
  // MemoryRouter has no window.location; observe the router's location instead.
  const LocationProbe = () => {
    const location = useLocation();
    useEffect(() => {
      locationRef = location;
    });
    return null;
  };
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        MemoryRouter,
        { initialEntries: [initialEntry] },
        createElement(LocationProbe),
        createElement(
          Routes,
          null,
          createElement(Route, { path: '/board/:id', element: children }),
        ),
      ),
    );
  return Object.assign(wrapper, {
    currentSearch: () => locationRef?.search ?? '',
  });
}

describe('useActiveView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    viewsQueryOverride.current = null;
  });

  it('resolves the active view from ?view=', () => {
    const { result } = renderHook(() => useActiveView('b1'), {
      wrapper: makeWrapper('/board/b1?view=v1'),
    });
    expect(result.current.activeView).not.toBeNull();
    expect(result.current.activeView?.id).toBe('v1');
  });

  it('returns null when there is no ?view= param', () => {
    const { result } = renderHook(() => useActiveView('b1'), {
      wrapper: makeWrapper('/board/b1'),
    });
    expect(result.current.activeView).toBeNull();
  });

  it('strips a stale ?view= param with replace', () => {
    const { result } = renderHook(() => useActiveView('b1'), {
      wrapper: makeWrapper('/board/b1?view=missing'),
    });
    // Once the effect resolves, the param is removed and no view is active.
    expect(result.current.activeView).toBeNull();
  });

  it('does not strip a valid ?view= while the views query is still loading', () => {
    viewsQueryOverride.current = { data: [], isPending: true };
    const wrapper = makeWrapper('/board/b1?view=v1');
    renderHook(() => useActiveView('b1'), { wrapper });
    // The param survives at least one render pass even though data is empty.
    expect(wrapper.currentSearch()).not.toBe('');
  });

  it('strips a stale ?view= once the views query has loaded', () => {
    viewsQueryOverride.current = { data: [mockView], isPending: false };
    const wrapper = makeWrapper('/board/b1?view=missing');
    renderHook(() => useActiveView('b1'), { wrapper });
    expect(wrapper.currentSearch()).not.toContain('view=');
  });

  it('selectView sets the ?view= param', () => {
    const wrapper = makeWrapper('/board/b1');
    const { result } = renderHook(() => useActiveView('b1'), { wrapper });
    act(() => result.current.selectView('v1'));
    expect(wrapper.currentSearch()).toContain('view=v1');
  });

  it('selectView(null) removes the ?view= param', () => {
    const wrapper = makeWrapper('/board/b1?view=v1');
    const { result } = renderHook(() => useActiveView('b1'), { wrapper });
    act(() => result.current.selectView(null));
    expect(wrapper.currentSearch()).not.toContain('view=');
  });
});
