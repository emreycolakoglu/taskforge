import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { api } from './api';
import { useBoardsFull } from './use-boards';

vi.mock('./api', () => ({
  api: { boards: { getFull: vi.fn() } },
}));

describe('useBoardsFull', () => {
  it('returns the loaded boards in id order, sharing the board-full cache key', async () => {
    vi.mocked(api.boards.getFull).mockImplementation(
      async (id: string) => ({ id, identifier: id.toUpperCase() }) as never,
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useBoardsFull(['b2', 'b1']), { wrapper });

    await waitFor(() => expect(result.current.map((b) => b.id)).toEqual(['b2', 'b1']));
    expect(queryClient.getQueryData(['boards', 'b1', 'full'])).toMatchObject({ id: 'b1' });
  });
});
