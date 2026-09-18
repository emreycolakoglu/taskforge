import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/api', () => ({
  api: {
    attachments: {
      list: vi.fn(),
      upload: vi.fn(),
      delete: vi.fn(),
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
