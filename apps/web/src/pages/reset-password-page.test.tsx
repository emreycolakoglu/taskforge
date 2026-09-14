import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const resetPassword = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/api', () => ({
  api: { auth: { resetPassword } },
}));
vi.mock('react-router-dom', () => ({
  useParams: () => ({ token: 'raw-token' }),
  useNavigate: () => navigate,
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { ResetPasswordPage } from './reset-password-page';

function fill(password: string, confirm: string) {
  fireEvent.change(screen.getByLabelText('New Password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: confirm } });
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    resetPassword.mockReset();
    navigate.mockReset();
  });

  it('rejects mismatched passwords without calling the API', async () => {
    render(<ResetPasswordPage />);
    fill('newpassword', 'different');
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }));

    await waitFor(() => expect(screen.getByText(/do not match/i)).toBeTruthy());
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('surfaces the API error for an invalid token', async () => {
    resetPassword.mockRejectedValue(new Error('Invalid or expired reset token'));
    render(<ResetPasswordPage />);
    fill('newpassword', 'newpassword');
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }));

    await waitFor(() => expect(screen.getByText(/invalid or expired reset token/i)).toBeTruthy());
    expect(navigate).not.toHaveBeenCalled();
  });

  it('resets and navigates to /login on success', async () => {
    resetPassword.mockResolvedValue({ success: true });
    render(<ResetPasswordPage />);
    fill('newpassword', 'newpassword');
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }));

    await waitFor(() => expect(resetPassword).toHaveBeenCalledWith('raw-token', 'newpassword'));
    expect(navigate).toHaveBeenCalledWith('/login', { replace: true });
  });
});
