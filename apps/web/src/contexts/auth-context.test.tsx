/**
 * AuthProvider redirect behaviour.
 *
 * The provider's init effect runs on every mount regardless of route. The
 * tricky case is the public invite route (/signup/:token): an invited user is
 * on an already-onboarded app with no session token, and must be left on the
 * signup page instead of being bounced to /login.
 */
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

vi.mock('@/hooks/api', () => ({
  api: { auth: { status: vi.fn(), me: vi.fn() } },
  setToken: vi.fn(),
  clearToken: vi.fn(),
  getToken: vi.fn(),
  setOnUnauthorized: vi.fn(),
}));

import { AuthProvider } from './auth-context';
import { api, getToken } from '@/hooks/api';

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

describe('AuthProvider init redirects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getToken as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (api.auth.status as ReturnType<typeof vi.fn>).mockResolvedValue({ onboarded: true });
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
});
