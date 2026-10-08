import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SidebarProvider } from '@/components/ui/sidebar';
import { ProjectsPage } from './projects-page';

const createMutate = vi.fn();

const mockProjects = [
  {
    id: 'p1',
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
    // Server-side rollup (Projects v2): tasks may span several boards.
    progress: { total: 2, completed: 1 },
  },
  {
    id: 'p2',
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
    progress: { total: 0, completed: 0 },
  },
];

// Mutable so each test can swap fixture data before rendering.
const data = { projects: mockProjects };

vi.mock('@/hooks/use-projects', () => ({
  useProjects: () => ({ data: data.projects, isLoading: false }),
  useProject: () => ({ data: undefined, isLoading: false }),
  useCreateProject: () => ({ mutate: createMutate, isPending: false }),
}));
// The list page is global (Projects v2): progress comes from the API payload,
// so no board-scoped hook may be touched. These mocks fail loudly if one is.
vi.mock('@/hooks/use-boards', () => ({
  useBoardFull: () => {
    throw new Error('board-scoped hook used on the global projects page');
  },
}));
vi.mock('@/hooks/use-tasks', () => ({
  useTasksByBoard: () => {
    throw new Error('board-scoped hook used on the global projects page');
  },
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
        <MemoryRouter initialEntries={['/projects']}>
          <Routes>
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:projectId" element={<p>project detail</p>} />
          </Routes>
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

  it('renders at the global /projects route with a plain Projects heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Projects');
  });

  it('navigates a row to the global project detail route', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText('Roadmap'));
    expect(screen.getByText('project detail')).toBeInTheDocument();
  });

  it('renders an accurate per-project progress bar from the API rollup', () => {
    renderPage();
    const roadmapBar = screen.getByRole('progressbar', { name: 'Roadmap progress' });
    expect(roadmapBar).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('1/2')).toBeInTheDocument();
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

  it('shows the empty state when the workspace has no projects', () => {
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
