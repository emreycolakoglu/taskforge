import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { AttachmentSection } from './attachment-section';

const upload = vi.fn();
const remove = vi.fn();

vi.mock('@/hooks/use-attachments', () => ({
  useAttachments: () => ({
    data: [
      {
        id: 'a1',
        subjectType: 'task',
        subjectId: 't1',
        filename: 'report.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        uploaderId: 'u1',
        uploader: { id: 'u1', displayName: 'Alice' },
        createdAt: '2026-09-17T12:00:00Z',
      },
    ],
  }),
  useUploadAttachment: () => ({ mutate: upload, isPending: false }),
  useDeleteAttachment: () => ({ mutate: remove, isPending: false }),
}));

vi.mock('@/hooks/use-settings', () => ({
  useSettings: () => ({
    data: { maxFileSizeMb: 1, allowedMimeTypes: ['text/plain'] },
  }),
}));

vi.mock('@/hooks/use-members', () => ({
  useMembers: () => ({ data: [{ userId: 'u2', role: 'member' }] }),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u2', role: 'member' } }),
}));

vi.mock('@/hooks/api', () => ({ api: { attachments: { download: vi.fn() } } }));

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

describe('AttachmentSection', () => {
  it('rejects a file that exceeds the configured size without uploading', async () => {
    render(<AttachmentSection subjectType="task" subjectId="t1" boardId="b1" taskId="t1" />);
    const file = new File([new Uint8Array(1024 * 1024 + 1)], 'large.txt', { type: 'text/plain' });

    await userEvent.upload(screen.getByLabelText('Upload attachment'), file);

    expect(upload).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('File exceeds the 1 MB limit');
  });

  it('hides delete from members who did not upload the attachment', () => {
    render(<AttachmentSection subjectType="task" subjectId="t1" boardId="b1" taskId="t1" />);

    expect(screen.queryByLabelText('Delete report.pdf')).not.toBeInTheDocument();
  });
});
