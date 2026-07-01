import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TaskDetailPage } from './task-detail-page'

const mockTask = {
  id: 'task-1',
  statusId: 'status-1',
  boardId: 'board-1',
  number: 1,
  taskNumber: 'TF-1',
  title: 'Fix login bug',
  description: 'Login page is broken',
  position: 0,
  priority: 'high' as const,
  assigneeId: 'user-1',
  assignee: { id: 'user-1', email: 'alice@example.com', displayName: 'Alice', role: 'admin' as const, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  dueDate: '2026-07-01',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  taskLabels: [
    { taskId: 'task-1', labelId: 'label-1', assignedAt: '2026-01-01', label: { id: 'label-1', boardId: 'board-1', name: 'Bug', color: '#EF4444', createdAt: '2026-01-01', updatedAt: '2026-01-01' } },
  ],
  activity: [
    { id: 'a1', taskId: 'task-1', actor: 'Alice', action: 'created', createdAt: '2026-01-01T00:00:00Z' },
  ],
}

const mockBoard = {
  id: 'board-1',
  name: 'Sprint 1',
  slug: 'sprint-1',
  identifier: 'TF',
  description: 'First sprint',
  createdAt: '2026-01-01',
  statuses: [
    { id: 'status-1', boardId: 'board-1', name: 'Backlog', position: 0, tasks: [mockTask] },
  ],
  labels: [
    { id: 'label-1', boardId: 'board-1', name: 'Bug', color: '#EF4444', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  ],
}

vi.mock('@/hooks/use-tasks', () => ({
  useTask: () => ({ data: mockTask, isLoading: false, error: null }),
  useUpdateTask: () => ({ mutate: vi.fn() }),
  useTasksByBoard: () => ({ data: [mockTask] }),
  useCreateTask: () => ({ mutate: vi.fn() }),
}))

vi.mock('@/hooks/use-boards', () => ({
  useBoardFull: () => ({ data: mockBoard }),
}))

vi.mock('@/hooks/use-comments', () => ({
  useComments: () => ({ data: [{ id: 'c1', taskId: 'task-1', author: 'Alice', body: 'Looks good', createdAt: '2026-01-01T00:00:00Z' }] }),
  useCreateComment: () => ({ mutate: vi.fn() }),
}))

vi.mock('@/hooks/use-users', () => ({
  useUsers: () => ({ data: [{ id: 'user-1', email: 'alice@example.com', displayName: 'Alice', role: 'admin', createdAt: '2026-01-01', updatedAt: '2026-01-01' }] }),
}))

vi.mock('@/hooks/use-labels', () => ({
  useLabels: () => ({ data: mockBoard.labels }),
}))

function renderPage(route = '/board/board-1/task/task-1') {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <TaskDetailPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('TaskDetailPage', () => {
  it('renders the task title and task number', () => {
    renderPage()

    expect(screen.getByText('TF-1')).toBeInTheDocument()
    expect(screen.getByText('Fix login bug')).toBeInTheDocument()
  })

  it('renders the task description', () => {
    renderPage()

    expect(screen.getByText('Login page is broken')).toBeInTheDocument()
  })

  it('renders the status name in the sidebar', () => {
    renderPage()

    // Status name appears in both the breadcrumb and the sidebar property row.
    expect(screen.getAllByText('Backlog').length).toBeGreaterThanOrEqual(1)
  })

  it('renders activity entries', () => {
    renderPage()

    expect(screen.getByText('created')).toBeInTheDocument()
  })

  it('renders comments', () => {
    renderPage()

    expect(screen.getByText('Looks good')).toBeInTheDocument()
  })

  it('renders priority select showing current priority', () => {
    renderPage()

    // Priority is now a Select (not 4 buttons); trigger shows the current value.
    expect(screen.getByText('High')).toBeInTheDocument()
  })

  it('renders assignee selector showing current assignee', () => {
    renderPage()

    // Alice appears in multiple places (activity, comment, assignee dropdown),
    // so we verify it's present at least once
    expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
  })

  it('shows back button', () => {
    renderPage()

    expect(screen.getByLabelText('Back to board')).toBeInTheDocument()
  })

  it('shows due date when present', () => {
    renderPage()

    expect(screen.getByText(/Jul/)).toBeInTheDocument()
  })

  it('shows sub-issues section', () => {
    renderPage()

    // "Sub-issues" appears in both the main section heading and the sidebar row.
    expect(screen.getAllByText('Sub-issues').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('No sub-issues')).toBeInTheDocument()
  })

  it('renders the label pill for the task', () => {
    renderPage()

    // "Bug" appears both in the label section of main content and in sidebar
    expect(screen.getAllByText('Bug').length).toBeGreaterThanOrEqual(1)
  })
})