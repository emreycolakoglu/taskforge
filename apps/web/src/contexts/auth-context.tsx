import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken, clearToken, getToken, setOnUnauthorized } from '@/hooks/api';
import type { User } from '@/types';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isInitialized: boolean | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (data: { displayName?: string; currentPassword?: string; newPassword?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(getToken());
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState<boolean | null>(null);
  const navigate = useNavigate();

  const handleUnauthorized = useCallback(() => {
    setUser(null);
    setTokenState(null);
    clearToken();
    navigate('/login', { replace: true });
  }, [navigate]);

  useEffect(() => {
    setOnUnauthorized(handleUnauthorized);
    return () => setOnUnauthorized(null);
  }, [handleUnauthorized]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Signup runs on a public invite route (/signup/:token). An invited user
      // has no session yet, so the "onboarded but no token" path below must not
      // bounce them to /login before they can accept the invite.
      const onSignupRoute = window.location.pathname.startsWith('/signup/');

      try {
        const status = await api.auth.status();
        if (cancelled) return;
        setIsInitialized(status.onboarded);

        if (!status.onboarded) {
          setIsLoading(false);
          navigate('/onboarding', { replace: true });
          return;
        }

        const storedToken = getToken();
        if (!storedToken) {
          setIsLoading(false);
          if (!onSignupRoute) navigate('/login', { replace: true });
          return;
        }

        try {
          const me = await api.auth.me();
          if (cancelled) return;
          setUser(me);
          setTokenState(storedToken);
        } catch {
          if (cancelled) return;
          clearToken();
          setTokenState(null);
          if (!onSignupRoute) navigate('/login', { replace: true });
        }
      } catch {
        if (cancelled) return;
        // Network error — stay on current page, user can retry
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, [navigate]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.auth.login(email, password);
    setToken(res.session.token);
    setTokenState(res.session.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // Ignore — token might already be invalid
    }
    clearToken();
    setTokenState(null);
    setUser(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  const updateUser = useCallback(async (data: { displayName?: string; currentPassword?: string; newPassword?: string }) => {
    const updated = await api.auth.updateUser(data);
    setUser(updated);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, isInitialized, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}