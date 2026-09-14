import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const forgotPassword = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/api', () => ({
  api: { auth: { forgotPassword } },
}));

import { ForgotPasswordPage } from './forgot-password-page';

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    forgotPassword.mockReset();
  });

  it('shows the generic confirmation for any email', async () => {
    forgotPassword.mockResolvedValue({ success: true });
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'a@b.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => expect(screen.getByText(/if an account exists/i)).toBeTruthy());
    expect(forgotPassword).toHaveBeenCalledWith('a@b.com');
  });

  it('still shows the confirmation when the request rejects', async () => {
    forgotPassword.mockRejectedValue(new Error('boom'));
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'a@b.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => expect(screen.getByText(/if an account exists/i)).toBeTruthy());
  });
});
