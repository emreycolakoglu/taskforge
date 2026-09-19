import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { AttachmentChips } from './attachment-chips';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  members: vi.fn(),
  remove: vi.fn(),
  download: vi.fn(),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: mocks.user() }),
}));

vi.mock('@/hooks/use-members', () => ({
  useMembers: () => mocks.members(),
}));

vi.mock('@/hooks/use-attachments', () => ({
  useDeleteAttachment: () => ({ mutate: mocks.remove, isPending: false }),
}));

vi.mock('@/hooks/api', () => ({
  api: { attachments: { download: mocks.download } },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const attachment = {
  id: 'a1',
  subjectType: 'comment' as const,
  subjectId: 'c1',
  filename: 'report.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  uploaderId: 'u1',
  uploader: { id: 'u1', displayName: 'Alice' },
  createdAt: '2026-09-17T12:00:00Z',
};

describe('AttachmentChips', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockReturnValue({ id: 'u2', role: 'member' });
    mocks.members.mockReturnValue({ data: [{ userId: 'u2', role: 'member' }] });
    mocks.download.mockResolvedValue(undefined);
  });

  it('renders a comment attachment chip with its filename and download action', () => {
    render(<AttachmentChips attachments={[attachment]} subjectId="c1" boardId="b1" taskId="t1" />);

    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByLabelText('Download report.pdf')).toBeInTheDocument();
  });

  it('shows delete to a board admin', () => {
    mocks.members.mockReturnValue({ data: [{ userId: 'u2', role: 'admin' }] });

    render(<AttachmentChips attachments={[attachment]} subjectId="c1" boardId="b1" taskId="t1" />);

    expect(screen.getByLabelText('Delete report.pdf')).toBeInTheDocument();
  });

  it('shows delete to a global admin', () => {
    mocks.user.mockReturnValue({ id: 'u2', role: 'admin' });

    render(<AttachmentChips attachments={[attachment]} subjectId="c1" boardId="b1" taskId="t1" />);

    expect(screen.getByLabelText('Delete report.pdf')).toBeInTheDocument();
  });

  it('shows delete to the uploader', () => {
    const { rerender } = render(
      <AttachmentChips attachments={[attachment]} subjectId="c1" boardId="b1" taskId="t1" />,
    );
    expect(screen.queryByLabelText('Delete report.pdf')).not.toBeInTheDocument();

    mocks.user.mockReturnValue({ id: 'u1', role: 'member' });
    mocks.members.mockReturnValue({ data: [{ userId: 'u1', role: 'member' }] });
    rerender(
      <AttachmentChips attachments={[attachment]} subjectId="c1" boardId="b1" taskId="t1" />,
    );
    expect(screen.getByLabelText('Delete report.pdf')).toBeInTheDocument();
  });

  it('downloads the attachment', async () => {
    render(<AttachmentChips attachments={[attachment]} subjectId="c1" boardId="b1" taskId="t1" />);

    await userEvent.click(screen.getByLabelText('Download report.pdf'));

    expect(mocks.download).toHaveBeenCalledWith(attachment);
  });

  it('shows an error when download fails', async () => {
    mocks.download.mockRejectedValueOnce(new Error('Object missing'));
    render(<AttachmentChips attachments={[attachment]} subjectId="c1" boardId="b1" taskId="t1" />);

    await userEvent.click(screen.getByLabelText('Download report.pdf'));

    expect(toast.error).toHaveBeenCalledWith('Failed to download attachment', {
      description: 'Object missing',
    });
  });
});
