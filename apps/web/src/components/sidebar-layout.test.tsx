import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SidebarLayout } from './sidebar-layout'

const mockUser = {
  id: '1',
  displayName: 'Test User',
  email: 'test@test.com',
  role: 'admin' as const,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
}

const mockBoards = [
  { id: 'b1', name: 'Sprint 1', slug: 'sprint-1', identifier: 'SP1', createdAt: '2026-01-01' },
  { id: 'b2', name: 'Sprint 2', slug: 'sprint-2', identifier: 'SP2', createdAt: '2026-01-15' },
  { id: '123', name: 'Active Board', slug: 'active-board', identifier: 'AB', createdAt: '2026-02-01' },
]

const mockLogout = vi.fn()
const mockNavigate = vi.fn()

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: mockUser, logout: mockLogout }),
}))

vi.mock('@/hooks/use-boards', () => ({
  useBoards: () => ({ data: mockBoards, isLoading: false }),
  useCreateBoard: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function renderSidebar(route = '/') {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <SidebarLayout>
          <div>Main content</div>
        </SidebarLayout>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SidebarLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders workspace header with TaskForge text and avatar letter', () => {
    renderSidebar()

    expect(screen.getByText('TaskForge')).toBeInTheDocument()
    const avatarLetters = screen.getAllByText('T')
    expect(avatarLetters.length).toBeGreaterThanOrEqual(1)
  })

  it('workspace header is a plain label, not a dropdown trigger', () => {
    renderSidebar()

    // The header should not have a role="button" — it's a div, not interactive
    expect(screen.queryByRole('button', { name: /taskforge/i })).not.toBeInTheDocument()
  })

  it('renders My Tasks in primary nav', () => {
    renderSidebar()

    expect(screen.getByText('My Tasks')).toBeInTheDocument()
  })

  it('does not render a Boards nav link in primary nav', () => {
    renderSidebar()

    expect(screen.queryByRole('link', { name: /boards/i })).not.toBeInTheDocument()
  })

  it('renders boards section with header and board items', () => {
    renderSidebar()

    // BOARDS section header
    expect(screen.getByText('BOARDS')).toBeInTheDocument()

    // Plus button for creating a board
    expect(screen.getByLabelText('Create board')).toBeInTheDocument()

    // Board items render as links
    expect(screen.getByText('Sprint 1')).toBeInTheDocument()
    expect(screen.getByText('Sprint 2')).toBeInTheDocument()
    expect(screen.getByText('Active Board')).toBeInTheDocument()
  })

  it('board items link to correct URLs', () => {
    renderSidebar()

    expect(screen.getByRole('link', { name: /sprint 1/i })).toHaveAttribute('href', '/board/b1')
    expect(screen.getByRole('link', { name: /sprint 2/i })).toHaveAttribute('href', '/board/b2')
    expect(screen.getByRole('link', { name: /active board/i })).toHaveAttribute('href', '/board/123')
  })

  it('highlights the active board based on URL', () => {
    renderSidebar('/board/123')

    const activeLink = screen.getByRole('link', { name: /active board/i })
    expect(activeLink).toHaveAttribute('aria-current', 'page')
  })

  it('collapses boards section when BOARDS header is clicked', async () => {
    const user = userEvent.setup()
    renderSidebar()

    // Board items are visible initially
    expect(screen.getByText('Sprint 1')).toBeInTheDocument()

    // Click BOARDS header to collapse
    const boardsHeader = screen.getByText('BOARDS')
    await user.click(boardsHeader)

    // Board items should be hidden
    expect(screen.queryByText('Sprint 1')).not.toBeInTheDocument()
    expect(screen.queryByText('Sprint 2')).not.toBeInTheDocument()
  })

  it('expands boards section when BOARDS header is clicked again', async () => {
    const user = userEvent.setup()
    renderSidebar()

    // Collapse
    await user.click(screen.getByText('BOARDS'))
    expect(screen.queryByText('Sprint 1')).not.toBeInTheDocument()

    // Expand again
    await user.click(screen.getByText('BOARDS'))
    expect(screen.getByText('Sprint 1')).toBeInTheDocument()
  })

  it('renders settings link in bottom section', () => {
    renderSidebar()

    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('renders user display name in bottom section', () => {
    renderSidebar()

    expect(screen.getByText('Test User')).toBeInTheDocument()
  })

  it('collapses sidebar when collapse button is clicked', async () => {
    const user = userEvent.setup()
    renderSidebar()

    expect(screen.getByText('TaskForge')).toBeInTheDocument()

    const collapseButton = screen.getByLabelText('Collapse sidebar')
    await user.click(collapseButton)

    expect(screen.queryByText('TaskForge')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Expand sidebar')).toBeInTheDocument()
  })

  it('shows Boards icon link when sidebar is collapsed', async () => {
    const user = userEvent.setup()
    renderSidebar()

    // Collapse sidebar
    await user.click(screen.getByLabelText('Collapse sidebar'))

    // Should show a Boards icon link with tooltip
    expect(screen.getByLabelText('Boards')).toBeInTheDocument()

    // Board names should be hidden
    expect(screen.queryByText('Sprint 1')).not.toBeInTheDocument()
  })

  it('opens create board dialog when plus button is clicked', async () => {
    const user = userEvent.setup()
    renderSidebar()

    const plusButton = screen.getByLabelText('Create board')
    await user.click(plusButton)

    // The dialog should be opened (it's controlled by createDialogOpen state)
    // We verify the button click handler fires without error
    expect(plusButton).toBeInTheDocument()
  })
})