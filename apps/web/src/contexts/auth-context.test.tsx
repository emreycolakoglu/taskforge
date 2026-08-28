/**
 * AuthProvider redirect behaviour.
 *
 * The provider's init effect runs on every mount regardless of route. The
 * tricky case is the public invite route (/signup/:token): an invited user is
 * on an already-onboarded app with no session token, and must be left on the
 * signup page instead of being bounced to /login.
 */
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

vi.mock('@/hooks/api', () => ({
  api: { auth: { status: vi.fn(), me: vi.fn(), logout: vi.fn() } },
  setToken: vi.fn(),
  clearToken: vi.fn(),
  getToken: vi.fn(),
  setOnUnauthorized: vi.fn(),
}));

vi.mock('@/hooks/use-socket', () => ({
  resetSocket: vi.fn(),
}));

import { AuthProvider, useAuth } from './auth-context';
import { api, getToken, setOnUnauthorized } from '@/hooks/api';
import { resetSocket } from '@/hooks/use-socket';

function setPath(path: string) {
  window.history.pushState({}, '', path);
}

function renderProvider() {
  return render(
    <AuthProvider>
      <div>child</div>
    </AuthProvider>,
  );
}

function renderProviderWithLogout() {
  return render(
    <AuthProvider>
      <LogoutButton />
    </AuthProvider>,
  );
}

function LogoutButton() {
  const { logout } = useAuth();
  return <button onClick={logout}>logout</button>;
}

describe('AuthProvider init redirects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getToken as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (api.auth.status as ReturnType<typeof vi.fn>).mockResolvedValue({ onboarded: true });
    (api.auth.logout as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
  });

  it('stays on the signup page when onboarded and unauthenticated', async () => {
    setPath('/signup/invite-token-123');
    renderProvider();

    await waitFor(() => expect(api.auth.status).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalledWith('/login', { replace: true });
  });

  it('redirects to /login on other routes when onboarded and unauthenticated', async () => {
    setPath('/board/abc');
    renderProvider();

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login', { replace: true }));
  });

  it('resets the socket on logout', async () => {
    setPath('/board/abc');
    (getToken as ReturnType<typeof vi.fn>).mockReturnValue('old-token');
    (api.auth.me as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      displayName: 'User',
      role: 'member',
    });
    let resetBeforeLogoutRequest = false;
    (api.auth.logout as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      resetBeforeLogoutRequest = (resetSocket as ReturnType<typeof vi.fn>).mock.calls.length > 0;
      return { success: true };
    });
    renderProviderWithLogout();

    await waitFor(() => expect(api.auth.me).toHaveBeenCalled());
    fireEvent.click(document.querySelector('button')!);

    await waitFor(() => expect(api.auth.logout).toHaveBeenCalled());
    expect(resetSocket).toHaveBeenCalledTimes(1);
    expect(resetBeforeLogoutRequest).toBe(true);
  });

  it('resets the socket when the API clears an unauthorized session', async () => {
    setPath('/board/abc');
    renderProvider();

    await waitFor(() => expect(setOnUnauthorized).toHaveBeenCalled());
    const handler = (setOnUnauthorized as ReturnType<typeof vi.fn>).mock.calls[0][0];
    act(() => handler());

    expect(resetSocket).toHaveBeenCalledTimes(1);
  });

  it('resets the socket when the stored session fails validation', async () => {
    setPath('/board/abc');
    (getToken as ReturnType<typeof vi.fn>).mockReturnValue('expired-token');
    (api.auth.me as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Unauthorized'));
    renderProvider();

    await waitFor(() => expect(api.auth.me).toHaveBeenCalled());

    expect(resetSocket).toHaveBeenCalledTimes(1);
  });
});
