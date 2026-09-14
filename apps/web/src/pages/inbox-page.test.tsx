import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InboxPage } from './inbox-page';
import type { Notification } from '@/types';

vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: vi.fn(),
  useMarkRead: vi.fn(),
  useMarkAllRead: vi.fn(),
}));

vi.mock('@/hooks/use-tasks', () => ({
  useTask: () => ({ data: { id: 't1', boardId: 'b1', title: 'T' }, isLoading: false }),
}));

vi.mock('@/components/task-detail-view', () => ({
  TaskDetailView: () => <div data-testid="tdv">DetailView</div>,
}));

import { useNotifications, useMarkRead } from '@/hooks/use-notifications';

const mockUseNotifications = vi.mocked(useNotifications);
const mockUseMarkRead = vi.mocked(useMarkRead);

function makeNotification(overrides: Partial<Notification>): Notification {
  return {
    id: 'n1',
    userId: 'u1',
    taskId: 't1',
    activityId: 'a1',
    action: 'commented',
    summary: 'Alice commented on TFG-1 "Title"',
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  } as Notification;
}

function renderPage(route: string, strict = false) {
  const queryClient = new QueryClient();
  const ui = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/inbox/:notificationId" element={<InboxPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(strict ? <StrictMode>{ui}</StrictMode> : ui);
}

describe('InboxPage mark-read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseNotifications.mockReturnValue({ data: [] } as never);
    mockUseMarkRead.mockReturnValue({ mutate: vi.fn() } as never);
  });

  it('marks an unread notification read exactly once when selected', async () => {
    const mutate = vi.fn();
    const notification = makeNotification({});
    mockUseNotifications.mockReturnValue({ data: [notification] } as never);
    mockUseMarkRead.mockReturnValue({ mutate } as never);

    renderPage('/inbox/n1');

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    expect(mutate).toHaveBeenCalledWith('n1');
  });

  it('does not mark already-read notifications', () => {
    const mutate = vi.fn();
    const notification = makeNotification({ readAt: new Date().toISOString() });
    mockUseNotifications.mockReturnValue({ data: [notification] } as never);
    mockUseMarkRead.mockReturnValue({ mutate } as never);

    renderPage('/inbox/n1');

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText('Alice commented on TFG-1 "Title"')).toBeInTheDocument();
  });

  it('marks read only once even when markRead identity changes and data stays stale-unread', async () => {
    const mutate = vi.fn();
    // Real-world loop: the notification stays readAt:null in the cache while the
    // refetch is in flight, and useMarkRead returns a fresh object per render.
    const notification = makeNotification({});
    mockUseNotifications.mockReturnValue({ data: [notification], isLoading: false } as never);
    mockUseMarkRead.mockImplementation(() => ({ mutate }) as never);

    const { rerender } = renderPage('/inbox/n1', true);
    const rerenderUi = () => {
      const queryClient = new QueryClient();
      rerender(
        <StrictMode>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/inbox/n1']}>
              <Routes>
                <Route path="/inbox/:notificationId" element={<InboxPage />} />
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>
        </StrictMode>,
      );
    };
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        rerenderUi();
      });
    }
    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
