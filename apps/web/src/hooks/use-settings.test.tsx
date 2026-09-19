import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/hooks/api', () => ({
  api: {
    settings: {
      get: vi.fn(),
      update: vi.fn(),
      sendTestEmail: vi.fn(),
    },
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe('useUpdateSettings', () => {
  it('invalidates the attachment policy after a successful update', async () => {
    const { api } = await import('./api');
    vi.mocked(api.settings.update).mockResolvedValue({} as never);
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateQueries = vi.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { useUpdateSettings } = await import('./use-settings');
    const { result } = renderHook(() => useUpdateSettings(), { wrapper });

    act(() => result.current.mutate({ maxFileSizeMb: 25 }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['attachment-policy'] });
  });
});
