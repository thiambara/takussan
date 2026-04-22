'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  login as apiLogin,
  register as apiRegister,
  type LoginPayload,
  type RegisterPayload,
  type User,
} from '@/lib/auth';

type AuthContextValue = {
  user: User | null;
  /**
   * Auth token (Sanctum). Exposed so client-side helpers like `useApiQuery`
   * can forward it to `Authorization: Bearer ...`. Prefer same-origin Next
   * route handlers for authenticated reads — they already read the HttpOnly
   * cookie server-side — but direct cross-origin calls need this token.
   */
  token: string | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  refreshUser: () => Promise<void>;
  /**
   * Authenticate with email+password, persist the auth cookie via
   * `/api/auth/set-token`, and update the in-memory user. Returns the
   * authenticated user on success; throws on failure.
   */
  login: (payload: LoginPayload) => Promise<User>;
  /**
   * Register a new account, persist the auth cookie, and update the
   * in-memory user. Returns the freshly created user.
   */
  register: (payload: RegisterPayload) => Promise<User>;
  /**
   * Revoke the backend token and clear the local auth cookie. Does not
   * navigate — callers decide where to go next (the `useRequireAuth` hook
   * redirects automatically, while Navbar redirects to `/`).
   */
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  initialUser,
  initialToken,
}: {
  children: React.ReactNode;
  initialUser?: User | null;
  initialToken?: string | null;
}) {
  const [user, setUser] = useState<User | null>(initialUser ?? null);
  const [token, setToken] = useState<string | null>(initialToken ?? null);
  const [isLoading, setIsLoading] = useState(initialUser === undefined);
  const hasRetriedRef = useRef(false);

  useEffect(() => {
    if (initialUser !== undefined) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();

    const fetchUser = async () => {
      try {
        const r = await fetch('/api/auth/me', { signal: controller.signal });
        if (cancelled) return;
        if (r.ok) {
          const u = await r.json();
          if (!cancelled) setUser(u);
        } else {
          if (!cancelled) setUser(null);
          // If we got 401 and this is first load, try once more after delay
          // This handles race conditions where cookie isn't ready yet
          if (r.status === 401 && !hasRetriedRef.current) {
            hasRetriedRef.current = true;
            retryTimer = setTimeout(() => {
              fetch('/api/auth/me', { signal: controller.signal })
                .then((r2) => (r2.ok ? r2.json() : null))
                .then((u) => {
                  if (cancelled) return;
                  if (u) setUser(u);
                  else {
                    // Second try failed, logout to clean state
                    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
                  }
                })
                .catch(() => {
                  if (!cancelled) setUser(null);
                });
            }, 500);
          }
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchUser();

    return () => {
      cancelled = true;
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [initialUser]);

  const handleSetUser = useCallback((u: User | null) => setUser(u), []);

  const refreshUser = useCallback(async () => {
    setIsLoading(true);
    try {
      const r = await fetch('/api/auth/me');
      if (r.ok) {
        setUser(await r.json());
      } else {
        setUser(null);
        if (r.status === 401) {
          fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
        }
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const persistToken = useCallback(async (next: string) => {
    await fetch('/api/auth/set-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: next }),
    });
  }, []);

  const login = useCallback(
    async (payload: LoginPayload) => {
      const { token: next, user: u } = await apiLogin(payload);
      await persistToken(next);
      setToken(next);
      setUser(u);
      return u;
    },
    [persistToken],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const { token: next, user: u } = await apiRegister(payload);
      await persistToken(next);
      setToken(next);
      setUser(u);
      return u;
    },
    [persistToken],
  );

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Even if the network call fails, drop the in-memory user.
    }
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        setUser: handleSetUser,
        refreshUser,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

const noop = () => {};
const noopAsync = async () => {};
const noopThrow = async () => {
  throw new Error('AuthProvider is missing. Wrap the app tree in <AuthProvider>.');
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  return (
    ctx ?? {
      user: null,
      token: null,
      isLoading: false,
      setUser: noop,
      refreshUser: noopAsync,
      login: noopThrow as AuthContextValue['login'],
      register: noopThrow as AuthContextValue['register'],
      logout: noopAsync,
    }
  );
}
