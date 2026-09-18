import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import * as attachmentSection from './attachment-section';
import { AttachmentSection } from './attachment-section';

const mocks = vi.hoisted(() => ({
  attachments: vi.fn(),
  members: vi.fn(),
  settings: vi.fn(),
  user: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@/hooks/use-attachments', () => ({
  useAttachments: () => mocks.attachments(),
  useUploadAttachment: () => ({ mutate: mocks.upload, isPending: false }),
  useDeleteAttachment: () => ({ mutate: mocks.remove, isPending: false }),
}));

vi.mock('@/hooks/use-settings', () => ({
  useSettings: () => mocks.settings(),
}));

vi.mock('@/hooks/use-members', () => ({
  useMembers: () => mocks.members(),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: mocks.user() }),
}));

vi.mock('@/hooks/api', () => ({ api: { attachments: { download: vi.fn() } } }));

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

describe('AttachmentSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.attachments.mockReturnValue({
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
    });
    mocks.members.mockReturnValue({ data: [{ userId: 'u2', role: 'member' }] });
    mocks.settings.mockReturnValue({
      data: { maxFileSizeMb: 1, allowedMimeTypes: ['text/plain'] },
    });
    mocks.user.mockReturnValue({ id: 'u2', role: 'member' });
  });

  afterEach(() => vi.useRealTimers());

  function renderSection() {
    return render(<AttachmentSection subjectType="task" subjectId="t1" boardId="b1" taskId="t1" />);
  }

  it('renders attachment metadata', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-18T12:00:00Z'));
    renderSection();

    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByText('1.0 KB · Alice · Yesterday')).toBeInTheDocument();
  });

  it('rejects a file that exceeds the configured size without uploading', async () => {
    renderSection();
    const file = new File([new Uint8Array(1024 * 1024 + 1)], 'large.txt', { type: 'text/plain' });

    await userEvent.upload(screen.getByLabelText('Upload attachment'), file);

    expect(mocks.upload).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('File exceeds the 1 MB limit');
  });

  it('rejects a MIME type that is not allowed without uploading', async () => {
    renderSection();
    const file = new File(['image'], 'image.png', { type: 'image/png' });

    await userEvent.upload(screen.getByLabelText('Upload attachment'), file);

    expect(mocks.upload).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('File type image/png is not allowed');
  });

  it('defers validation to the API when settings are absent', async () => {
    mocks.settings.mockReturnValue({ data: undefined });
    renderSection();
    const file = new File(['image'], 'image.png', { type: 'image/png' });

    await userEvent.upload(screen.getByLabelText('Upload attachment'), file);

    expect(mocks.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectType: 'task',
        subjectId: 't1',
        file,
      }),
      expect.any(Object),
    );
  });

  it('exports file validation for attachment consumers', () => {
    const validate = (
      attachmentSection as typeof attachmentSection & {
        validateAttachmentFile?: (file: File, settings?: unknown) => string | undefined;
      }
    ).validateAttachmentFile;
    const largeFile = new File([new Uint8Array(1024 * 1024 + 1)], 'large.txt', {
      type: 'text/plain',
    });
    const imageFile = new File(['image'], 'image.png', { type: 'image/png' });

    expect(validate).toBeTypeOf('function');
    if (!validate) return;
    expect(validate(imageFile)).toBeUndefined();
    expect(validate(largeFile, { maxFileSizeMb: 1 })).toBe('File exceeds the 1 MB limit');
    expect(validate(imageFile, { allowedMimeTypes: ['text/plain'] })).toBe(
      'File type image/png is not allowed',
    );
  });

  it('uploads an allowed file with the attachment subject payload', async () => {
    renderSection();
    const file = new File(['report'], 'report.txt', { type: 'text/plain' });

    await userEvent.upload(screen.getByLabelText('Upload attachment'), file);

    expect(mocks.upload).toHaveBeenCalledWith(
      {
        subjectType: 'task',
        subjectId: 't1',
        taskId: 't1',
        documentId: undefined,
        file,
      },
      expect.any(Object),
    );
  });

  it('shows an error when an upload mutation fails', async () => {
    mocks.upload.mockImplementationOnce((_, options) =>
      options?.onError?.(new Error('Server rejected file')),
    );
    renderSection();
    const file = new File(['report'], 'report.txt', { type: 'text/plain' });

    await userEvent.upload(screen.getByLabelText('Upload attachment'), file);

    expect(toast.error).toHaveBeenCalledWith('Failed to upload attachment', {
      description: 'Server rejected file',
    });
  });

  it('hides delete from members who did not upload the attachment', () => {
    renderSection();

    expect(screen.queryByLabelText('Delete report.pdf')).not.toBeInTheDocument();
  });

  it('shows delete to the attachment uploader', () => {
    mocks.user.mockReturnValue({ id: 'u1', role: 'member' });
    mocks.members.mockReturnValue({ data: [{ userId: 'u1', role: 'member' }] });
    renderSection();

    expect(screen.getByLabelText('Delete report.pdf')).toBeInTheDocument();
  });

  it('confirms before deleting an attachment', async () => {
    mocks.user.mockReturnValue({ id: 'u1', role: 'member' });
    mocks.members.mockReturnValue({ data: [{ userId: 'u1', role: 'member' }] });
    renderSection();

    await userEvent.click(screen.getByLabelText('Delete report.pdf'));

    expect(mocks.remove).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Delete attachment?' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(mocks.remove).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'a1',
        subjectType: 'task',
        subjectId: 't1',
      }),
      expect.any(Object),
    );
  });

  it('shows an error when a delete mutation fails', async () => {
    mocks.user.mockReturnValue({ id: 'u1', role: 'member' });
    mocks.members.mockReturnValue({ data: [{ userId: 'u1', role: 'member' }] });
    mocks.remove.mockImplementationOnce((_, options) =>
      options?.onError?.(new Error('Server could not delete file')),
    );
    renderSection();

    await userEvent.click(screen.getByLabelText('Delete report.pdf'));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(toast.error).toHaveBeenCalledWith('Failed to delete attachment', {
      description: 'Server could not delete file',
    });
  });

  it('shows delete to a board admin', () => {
    mocks.members.mockReturnValue({ data: [{ userId: 'u2', role: 'admin' }] });
    renderSection();

    expect(screen.getByLabelText('Delete report.pdf')).toBeInTheDocument();
  });

  it('shows delete to a global admin', () => {
    mocks.user.mockReturnValue({ id: 'u2', role: 'admin' });
    renderSection();

    expect(screen.getByLabelText('Delete report.pdf')).toBeInTheDocument();
  });

  it('waits for membership data before showing upload', () => {
    mocks.members.mockReturnValue({ data: undefined });
    renderSection();

    expect(screen.queryByRole('button', { name: 'Upload' })).not.toBeInTheDocument();
  });

  it('shows upload for a confirmed legacy board with no members', () => {
    mocks.members.mockReturnValue({ data: [] });
    renderSection();

    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
  });

  it('hides upload from non-members when board members exist', () => {
    mocks.members.mockReturnValue({ data: [{ userId: 'u1', role: 'member' }] });
    renderSection();

    expect(screen.queryByRole('button', { name: 'Upload' })).not.toBeInTheDocument();
  });

  it('associates the hidden file input with an upload label', () => {
    renderSection();

    const input = screen.getByLabelText('Upload attachment') as HTMLInputElement;
    expect(input.labels).toHaveLength(1);
    expect(input.labels?.[0]).toHaveTextContent('Upload attachment');
  });
});
