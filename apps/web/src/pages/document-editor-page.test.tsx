import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DocumentEditorPage } from './document-editor-page';
import { SidebarProvider } from '@/components/ui/sidebar';
import { toast } from 'sonner';

const mockUseDocument = vi.fn();
const mockUseDeleteDocument = vi.fn();
const mockUseSetDocumentPublic = vi.fn();
const mockWriteText = vi.fn().mockResolvedValue(undefined);
const mockAttachmentSection = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-documents', () => ({
  useDocument: (...args: any[]) => mockUseDocument(...args),
  useUpdateDocument: () => ({ mutateAsync: vi.fn() }),
  useDeleteDocument: (...args: any[]) => mockUseDeleteDocument(...args),
  useSetDocumentPublic: (...args: any[]) => mockUseSetDocumentPublic(...args),
}));
vi.mock('@/components/markdown', () => ({
  MarkdownEditor: ({ value }: { value: string }) => <div data-testid="markdown">{value}</div>,
}));
vi.mock('@/components/attachment-section', () => ({
  AttachmentSection: (props: unknown) => {
    mockAttachmentSection(props);
    return <div data-testid="attachments">Attachments</div>;
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  mockUseDocument.mockImplementation((id: string) => ({
    data: {
      id,
      boardId: 'b1',
      taskId: 't1',
      number: 1,
      docNumber: 'D-1',
      boardIdentifier: 'TF',
      taskNumber: 'TF-1',
      taskTitle: 'Host',
      title: 'My doc',
      body: '',
      isPublic: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    isLoading: false,
    error: null,
  }));
  mockUseDeleteDocument.mockImplementation(() => ({ mutate: vi.fn() }));
  mockUseSetDocumentPublic.mockImplementation(() => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  }));
  Object.assign(navigator, { clipboard: { writeText: mockWriteText } });
});

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/board/b1/doc/d1']}>
        <SidebarProvider>
          <Routes>
            <Route path="/board/:boardId/doc/:docId" element={<DocumentEditorPage />} />
          </Routes>
        </SidebarProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DocumentEditorPage', () => {
  it('renders the doc number and back link', () => {
    renderPage();
    expect(screen.getByText('D-1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to task/i })).toBeInTheDocument();
  });

  it('publishes the document and copies the public link', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    mockUseSetDocumentPublic.mockImplementation(() => ({ mutateAsync }));
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /publish/i }));

    expect(mutateAsync).toHaveBeenCalledWith({
      id: 'd1',
      boardId: 'b1',
      taskId: 't1',
      isPublic: true,
    });
    await waitFor(() =>
      expect(mockWriteText).toHaveBeenCalledWith(`${window.location.origin}/public/docs/TF/1`),
    );
    expect(toast.success).toHaveBeenCalledWith('Document published', {
      description: 'Public link copied to clipboard',
    });
  });

  it('deletes the document after confirming', async () => {
    const mutate = vi.fn();
    mockUseDeleteDocument.mockImplementation(() => ({ mutate }));
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /delete document/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(mutate).toHaveBeenCalledWith(
      { id: 'd1', boardId: 'b1', taskId: 't1' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('places document attachments after the editor in the content column', () => {
    const { getByTestId } = renderPage();

    expect(mockAttachmentSection).toHaveBeenCalledWith({
      subjectType: 'document',
      subjectId: 'd1',
      boardId: 'b1',
      taskId: 't1',
    });
    expect(getByTestId('markdown').compareDocumentPosition(getByTestId('attachments'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(getByTestId('attachments').closest('.max-w-3xl')).not.toBeNull();
  });
});

const projectDoc = {
  id: 'd7',
  boardId: null,
  taskId: null,
  projectId: 'p1',
  project: { id: 'p1', name: 'Roadmap', icon: '🚀' },
  number: 3,
  docNumber: 'D-3',
  boardIdentifier: null,
  taskNumber: null,
  taskTitle: null,
  title: 'Project spec',
  body: '',
  isPublic: false,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

// The global /doc/:docId route (Projects v2) — the page derives its links
// from the loaded document, not the URL.
function renderGlobal(docId: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/doc/${docId}`]}>
        <SidebarProvider>
          <Routes>
            <Route path="/doc/:docId" element={<DocumentEditorPage />} />
            <Route path="/projects/:projectId" element={<p>project page</p>} />
            <Route path="/board/:boardId/docs" element={<p>board docs</p>} />
          </Routes>
        </SidebarProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DocumentEditorPage — global /doc/:docId route', () => {
  it('renders a project doc with a back link to its project and no publish control', () => {
    mockUseDocument.mockImplementation(() => ({ data: projectDoc, isLoading: false }));
    renderGlobal('d7');

    expect(screen.getByText('D-3')).toBeInTheDocument();
    const back = screen.getByRole('link', { name: /back to project/i });
    expect(back).toHaveAttribute('href', '/projects/p1?tab=documents');
    expect(screen.getByText('Roadmap')).toBeInTheDocument();
    // Project docs can't be published (API 400s) — no Publish, no visibility chip.
    expect(screen.queryByRole('button', { name: /publish/i })).not.toBeInTheDocument();
    expect(screen.queryByText('private')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /back to task/i })).not.toBeInTheDocument();
  });

  it('hands attachments the project doc subject with no board', () => {
    mockUseDocument.mockImplementation(() => ({ data: projectDoc, isLoading: false }));
    renderGlobal('d7');

    expect(mockAttachmentSection).toHaveBeenCalledWith({
      subjectType: 'document',
      subjectId: 'd7',
      boardId: null,
      taskId: null,
    });
  });

  it('deletes a project doc and returns to the project documents tab', async () => {
    mockUseDocument.mockImplementation(() => ({ data: projectDoc, isLoading: false }));
    const mutate = vi.fn((_vars, opts: { onSuccess: () => void }) => opts.onSuccess());
    mockUseDeleteDocument.mockImplementation(() => ({ mutate }));
    renderGlobal('d7');

    await userEvent.click(screen.getByRole('button', { name: /delete document/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(mutate).toHaveBeenCalledWith(
      { id: 'd7', boardId: null, taskId: null, projectId: 'p1' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(await screen.findByText('project page')).toBeInTheDocument();
  });

  it('builds task-doc links from the loaded doc when the URL has no board', async () => {
    const mutate = vi.fn((_vars, opts: { onSuccess: () => void }) => opts.onSuccess());
    mockUseDeleteDocument.mockImplementation(() => ({ mutate }));
    renderGlobal('d1');

    expect(screen.getByRole('link', { name: /back to task/i })).toHaveAttribute(
      'href',
      '/board/b1/task/t1',
    );
    expect(screen.getByRole('button', { name: /publish/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /delete document/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('board docs')).toBeInTheDocument();
  });
});
