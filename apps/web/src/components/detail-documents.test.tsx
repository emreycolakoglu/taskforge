import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import { DetailDocuments } from './detail-documents';

const mockDocs = [
  {
    id: 'd1',
    title: 'Spec',
    docNumber: 'D-1',
    taskNumber: 'TF-1',
    isPublic: false,
    updatedAt: '2026-01-01',
  },
];

// Module-level mock fn so per-test overrides work (same pattern as use-tasks.test.tsx).
const mockUseDocumentsByTask = vi.fn((..._args: any[]) => ({ data: mockDocs }));
const mockUseCreateDocument = vi.fn((_args?: any) => ({
  mutateAsync: vi.fn(),
}));

vi.mock('@/hooks/use-documents', () => ({
  useDocumentsByTask: (...args: any[]) => mockUseDocumentsByTask(...args),
  useCreateDocument: (args?: any) => mockUseCreateDocument(args),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  mockUseDocumentsByTask.mockImplementation(() => ({ data: mockDocs }));
  mockUseCreateDocument.mockImplementation(() => ({ mutateAsync: vi.fn() }));
});

function renderDocs() {
  return render(
    <MemoryRouter>
      <DetailDocuments taskId="t1" boardId="b1" />
    </MemoryRouter>,
  );
}

function renderWithUser() {
  return {
    user: userEvent.setup(),
    ...renderDocs(),
  };
}

describe('DetailDocuments', () => {
  it('lists documents with D-number and title', () => {
    renderDocs();
    expect(screen.getByText('Spec')).toBeInTheDocument();
    expect(screen.getByText('D-1')).toBeInTheDocument();
  });

  it('shows an empty state', () => {
    mockUseDocumentsByTask.mockImplementation(() => ({ data: [] }));
    renderDocs();
    expect(screen.getByText(/no documents/i)).toBeInTheDocument();
  });

  it('creates a document when Create is clicked', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ id: 'd2', docNumber: 'D-2' });
    mockUseCreateDocument.mockImplementation(() => ({ mutateAsync }));
    const { user } = renderWithUser();
    await user.click(screen.getByRole('button', { name: /new document/i }));
    await user.type(screen.getByPlaceholderText(/document title/i), 'Report');
    await user.click(screen.getByRole('button', { name: /^create$/i }));
    expect(mutateAsync).toHaveBeenCalledWith({
      taskId: 't1',
      boardId: 'b1',
      title: 'Report',
    });
  });

  it('keeps the form open and toasts when create fails', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error('boom'));
    mockUseCreateDocument.mockImplementation(() => ({ mutateAsync }));
    const { user } = renderWithUser();
    await user.click(screen.getByRole('button', { name: /new document/i }));
    await user.type(screen.getByPlaceholderText(/document title/i), 'Report');
    await user.click(screen.getByRole('button', { name: /^create$/i }));
    expect(screen.getByPlaceholderText(/document title/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Report')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^create$/i })).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('Failed to create document', {
      description: 'Please try again.',
    });
  });
});
