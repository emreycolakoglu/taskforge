import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/hooks/api', () => ({
  api: {
    attachments: {
      list: vi.fn(),
      upload: vi.fn(),
      delete: vi.fn(),
      policy: vi.fn(),
    },
  },
}));

describe('invalidateAttachmentSubject', () => {
  it('invalidates attachment and task queries for task attachments', async () => {
    const invalidateQueries = vi.fn();
    const { invalidateAttachmentSubject } = await import('./use-attachments');

    invalidateAttachmentSubject({ invalidateQueries } as never, {
      subjectType: 'task',
      subjectId: 't1',
    });

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['attachments', 'task', 't1'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['tasks', 't1'] });
  });

  it('invalidates the board full query when a task attachment changes', async () => {
    const invalidateQueries = vi.fn();
    const { invalidateAttachmentSubject } = await import('./use-attachments');

    invalidateAttachmentSubject({ invalidateQueries } as never, {
      subjectType: 'task',
      subjectId: 't1',
      boardId: 'b1',
    });

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['boards', 'b1', 'full'] });
  });

  it('invalidates attachment, comment, and task queries for comment attachments', async () => {
    const invalidateQueries = vi.fn();
    const { invalidateAttachmentSubject } = await import('./use-attachments');

    invalidateAttachmentSubject({ invalidateQueries } as never, {
      subjectType: 'comment',
      subjectId: 'c1',
      taskId: 't1',
    });

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['attachments', 'comment', 'c1'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['comments', 't1'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['tasks', 't1'] });
  });

  it('invalidates attachment, document, and task queries for document attachments', async () => {
    const invalidateQueries = vi.fn();
    const { invalidateAttachmentSubject } = await import('./use-attachments');

    invalidateAttachmentSubject({ invalidateQueries } as never, {
      subjectType: 'document',
      subjectId: 'd1',
      documentId: 'd1',
      taskId: 't1',
    });

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['attachments', 'document', 'd1'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['documents', 'd1'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['tasks', 't1'] });
  });
});

describe('useAttachmentPolicy', () => {
  it('loads the narrow attachment policy', async () => {
    const { api } = await import('@/hooks/api');
    const policy = { maxFileSizeMb: 10, allowedMimeTypes: ['text/plain'] };
    vi.mocked(api.attachments.policy).mockResolvedValue(policy);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { useAttachmentPolicy } = await import('./use-attachments');
    const { result } = renderHook(() => (useAttachmentPolicy as any)(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(policy));
    expect(api.attachments.policy).toHaveBeenCalledTimes(1);
  });
});
