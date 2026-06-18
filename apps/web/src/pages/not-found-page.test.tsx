import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { NotFoundPage } from './not-found-page'

function renderWithRouter(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>)
}

describe('NotFoundPage', () => {
  it('renders 404 heading and message', () => {
    renderWithRouter(<NotFoundPage />)

    expect(screen.getByText('Page not found')).toBeInTheDocument()
    expect(screen.getByText(/doesn't exist or has been moved/)).toBeInTheDocument()
  })

  it('renders a link back to the home page', () => {
    renderWithRouter(<NotFoundPage />)

    const link = screen.getByRole('link', { name: /back to boards/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/')
  })
})