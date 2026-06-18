import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { TasksPage } from './tasks-page'

// Mock the API module
vi.mock('@/hooks/api', () => ({
  api: {
    boards: {
      list: vi.fn(() => Promise.resolve([])),
    },
    tasks: {
      search: vi.fn(() => Promise.resolve([])),
    },
  },
}))

import { api } from '@/hooks/api'

function renderWithRouter(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>)
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

  it('calls api.tasks.search with the query and displays results', async () => {
    const mockTasks = [
      {
        id: 't1',
        listId: 'l1',
        title: 'Fix login bug',
        position: 0,
        priority: 'high' as const,
        status: 'active' as const,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        list: { id: 'l1', boardId: 'b1', name: 'Backlog', position: 0 },
      },
      {
        id: 't2',
        listId: 'l2',
        title: 'Update docs',
        position: 1,
        priority: 'low' as const,
        status: 'active' as const,
        createdAt: '2026-01-02',
        updatedAt: '2026-01-02',
        list: { id: 'l2', boardId: 'b1', name: 'Done', position: 4 },
      },
    ]
    vi.mocked(api.tasks.search).mockResolvedValueOnce(mockTasks as any)
    vi.mocked(api.boards.list).mockResolvedValueOnce([
      { id: 'b1', name: 'Sprint 1', slug: 'sprint-1', createdAt: '2026-01-01' },
    ] as any)

    renderWithRouter(<TasksPage />)

    const input = screen.getByPlaceholderText(/search tasks/i)
    await userEvent.type(input, 'bug')

    // Wait for the debounced search to fire
    await waitFor(() => {
      expect(api.tasks.search).toHaveBeenCalledWith('bug')
    })

    await waitFor(() => {
      expect(screen.getByText('Fix login bug')).toBeInTheDocument()
    })
  })

  it('shows empty state when search returns no results', async () => {
    vi.mocked(api.tasks.search).mockResolvedValueOnce([])

    renderWithRouter(<TasksPage />)

    const input = screen.getByPlaceholderText(/search tasks/i)
    await userEvent.type(input, 'xyz')

    await waitFor(() => {
      expect(api.tasks.search).toHaveBeenCalledWith('xyz')
    })

    await waitFor(() => {
      expect(screen.getByText(/no tasks found/i)).toBeInTheDocument()
    })
  })
})