import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SidebarProvider } from '@/components/ui/sidebar';
import { ProjectsPage } from './projects-page';

const createMutate = vi.fn();

const mockProjects = [
  {
    id: 'p1',
    boardId: 'b1',
    name: 'Roadmap',
    description: 'Q3 planning',
    icon: '📦',
    leadId: 'u1',
    status: 'started',
    completedAt: null,
    startDate: null,
    targetDate: '2026-08-15',
    position: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
  {
    id: 'p2',
    boardId: 'b1',
    name: 'Tech debt',
    description: null,
    icon: '🧹',
    leadId: null,
    status: 'planned',
    completedAt: null,
    startDate: null,
    targetDate: null,
    position: 2,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
];

// Two done-ish tasks on p1 (one done, one in progress) → 50% progress.
// t3 has no project (progress must not spill across projects).
const mockTasks = [
  { id: 't1', projectId: 'p1', status: { type: 'done' } },
  { id: 't2', projectId: 'p1', status: { type: 'in_progress' } },
  { id: 't3', projectId: null, status: { type: 'todo' } },
];

// Mutable so each test can swap fixture data before rendering.
const data = { projects: mockProjects, tasks: mockTasks };

vi.mock('@/hooks/use-projects', () => ({
  useProjects: () => ({ data: data.projects, isLoading: false }),
  useProject: () => ({ data: undefined, isLoading: false }),
  useCreateProject: () => ({ mutate: createMutate, isPending: false }),
}));
vi.mock('@/hooks/use-boards', () => ({
  useBoardFull: () => ({
    data: { id: 'b1', name: 'Sprint 1', identifier: 'TF', icon: '⭐', statuses: [] },
  }),
}));
vi.mock('@/hooks/use-tasks', () => ({
  useTasksByBoard: () => ({ data: data.tasks }),
}));
vi.mock('@/hooks/use-users', () => ({
  useUserDirectory: () => ({ data: [{ id: 'u1', displayName: 'Alice' }] }),
}));
vi.mock('@/hooks/use-socket', () => ({
  useSocket: () => ({ on: vi.fn() }),
}));

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <MemoryRouter initialEntries={['/board/b1/projects']}>
          <ProjectsPage />
        </MemoryRouter>
      </SidebarProvider>
    </QueryClientProvider>,
  );
}

describe('ProjectsPage', () => {
  it('renders project rows with icon, name, status chip and lead name', () => {
    renderPage();
    expect(screen.getByText('📦')).toBeInTheDocument();
    expect(screen.getByText('Roadmap')).toBeInTheDocument();
    expect(screen.getByText('Started')).toBeInTheDocument();
    expect(screen.getByText('Planned')).toBeInTheDocument();
    // p1 has lead u1 → directory resolves the display name; p2 has no lead.
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders an accurate per-project progress bar', () => {
    renderPage();
    const roadmapBar = screen.getByRole('progressbar', { name: 'Roadmap progress' });
    expect(roadmapBar).toHaveAttribute('aria-valuenow', '50');
    // No tasks linked → 0, not NaN.
    const debtBar = screen.getByRole('progressbar', { name: 'Tech debt progress' });
    expect(debtBar).toHaveAttribute('aria-valuenow', '0');
  });

  it('renders the target date when present', () => {
    renderPage();
    const expected = new Date('2026-08-15').toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('shows the empty state when the board has no projects', () => {
    data.projects = [];
    renderPage();
    expect(screen.getByText('No projects yet')).toBeInTheDocument();
    data.projects = mockProjects;
  });

  it('opens the create dialog and submits a new project', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /new project/i }));
    expect(screen.getByLabelText('Name')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Name'), 'Roadmap');
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Roadmap', icon: '📦', status: 'planned' }),
      expect.anything(),
    );
  });
});
