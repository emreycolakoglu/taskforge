/**
 * ProjectDocuments tests (Projects v2, Task 9) — the project page's
 * Documents tab. Hook modules are mocked; the tests pin the list markup
 * (D-n in mono), the title-only create flow against the project endpoint,
 * open → global /doc/:docId, and delete behind the house confirm.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';
import { ProjectDocuments } from './project-documents';

const mocks = vi.hoisted(() => ({
  docs: vi.fn(),
  createAsync: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@/hooks/use-documents', () => ({
  useProjectDocuments: (id: string) => mocks.docs(id),
  useCreateProjectDocument: () => ({ mutateAsync: mocks.createAsync, isPending: false }),
  useDeleteDocument: () => ({ mutate: mocks.remove, isPending: false }),
}));

const projectDocs = [
  {
    id: 'd1',
    boardId: null,
    taskId: null,
    projectId: 'p1',
    number: 3,
    docNumber: 'D-3',
    title: 'Launch plan',
    body: '',
    isPublic: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-02-03T00:00:00Z',
  },
  {
    id: 'd2',
    boardId: null,
    taskId: null,
    projectId: 'p1',
    number: 4,
    docNumber: 'D-4',
    title: 'Risks',
    body: '',
    isPublic: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-02-04T00:00:00Z',
  },
];

function DocProbe() {
  const { docId } = useParams();
  return <p>{`doc ${docId}`}</p>;
}

function renderDocs() {
  return render(
    <MemoryRouter initialEntries={['/projects/p1']}>
      <Routes>
        <Route path="/projects/:projectId" element={<ProjectDocuments projectId="p1" />} />
        <Route path="/doc/:docId" element={<DocProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

const formatDate = (ts: string) =>
  new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.docs.mockReturnValue({ data: projectDocs, isLoading: false });
});

describe('ProjectDocuments', () => {
  it("lists the project's documents with D-n in mono and the updated date", () => {
    renderDocs();

    expect(mocks.docs).toHaveBeenCalledWith('p1');
    const row = screen.getByRole('button', { name: /^D-3\s*Launch plan/ });
    const number = within(row).getByText('D-3');
    expect(number).toHaveClass('font-mono');
    expect(within(row).getByText(formatDate('2026-02-03T00:00:00Z'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^D-4\s*Risks/ })).toBeInTheDocument();
    // Project docs can't be published — no visibility column.
    expect(screen.queryByText('private')).not.toBeInTheDocument();
  });

  it('shows an empty state when the project has no documents', () => {
    mocks.docs.mockReturnValue({ data: [], isLoading: false });
    renderDocs();
    expect(screen.getByText('No documents yet')).toBeInTheDocument();
  });

  it('opens a document on the global editor route', async () => {
    renderDocs();
    await userEvent.click(screen.getByRole('button', { name: /^D-3\s*Launch plan/ }));
    expect(screen.getByText('doc d1')).toBeInTheDocument();
  });

  it('creates a title-only document against the project, then opens it', async () => {
    mocks.createAsync.mockResolvedValue({ id: 'd9' });
    renderDocs();

    await userEvent.click(screen.getByRole('button', { name: /new document/i }));
    const create = screen.getByRole('button', { name: 'Create' });
    expect(create).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Document title'), '  Kickoff notes ');
    await userEvent.click(create);

    expect(mocks.createAsync).toHaveBeenCalledWith({ projectId: 'p1', title: 'Kickoff notes' });
    expect(await screen.findByText('doc d9')).toBeInTheDocument();
  });

  it('deletes a document only after confirming', async () => {
    renderDocs();

    await userEvent.click(screen.getByRole('button', { name: 'Delete Launch plan' }));
    expect(mocks.remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(mocks.remove).toHaveBeenCalledWith({
      id: 'd1',
      boardId: null,
      taskId: null,
      projectId: 'p1',
    });
  });

  it('keeps nothing deleted when the confirm is cancelled', async () => {
    renderDocs();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Launch plan' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
