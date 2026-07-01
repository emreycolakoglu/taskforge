import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TasksPage } from './tasks-page'

// Mock the react-query hooks
vi.mock('@/hooks/use-boards', () => ({
  useBoards: () => ({
    data: [
      { id: 'b1', name: 'Sprint 1', slug: 'sprint-1', createdAt: '2026-01-01' },
    ],
  }),
}))

vi.mock('@/hooks/use-tasks', () => ({
  useSearchTasks: (q: string) => {
    if (!q) return { data: [], isFetched: false }
    return {
      data: [
        {
          id: 't1',
          statusId: 's1',
          title: 'Fix login bug',
          position: 0,
          priority: 'high',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
          status: { id: 's1', boardId: 'b1', name: 'Backlog', position: 0 },
        },
      ],
      isFetched: true,
    }
  },
}))

function renderWithRouter(ui: React.ReactElement) {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{ui}</BrowserRouter>
    </QueryClientProvider>,
  )
}

describe('TasksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the page heading and search input', () => {
    renderWithRouter(<TasksPage />)

    expect(screen.getByText('Tasks')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/search tasks/i)).toBeInTheDocument()
  })

  it('shows placeholder prompt when no search has been entered', () => {
    renderWithRouter(<TasksPage />)

    expect(screen.getByText(/start typing to search/i)).toBeInTheDocument()
  })

  it('displays search results when query is entered', async () => {
    renderWithRouter(<TasksPage />)

    const input = screen.getByPlaceholderText(/search tasks/i)
    await userEvent.type(input, 'bug')

    await waitFor(() => {
      expect(screen.getByText('Fix login bug')).toBeInTheDocument()
    })
  })
})