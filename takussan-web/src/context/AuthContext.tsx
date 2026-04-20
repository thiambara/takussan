'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { User } from '@/lib/auth';

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children, initialUser }: { children: React.ReactNode; initialUser?: User | null }) {
  const [user, setUser] = useState<User | null>(initialUser ?? null);
  const [isLoading, setIsLoading] = useState(initialUser === undefined);
  const hasRetriedRef = useRef(false);

  useEffect(() => {
    if (initialUser !== undefined) return;

    const fetchUser = async () => {
      try {
        const r = await fetch('/api/auth/me');
        if (r.ok) {
          const u = await r.json();
          setUser(u);
        } else {
          setUser(null);
          // If we got 401 and this is first load, try once more after delay
          // This handles race conditions where cookie isn't ready yet
          if (r.status === 401 && !hasRetriedRef.current) {
            hasRetriedRef.current = true;
            setTimeout(() => {
              fetch('/api/auth/me')
                .then((r2) => (r2.ok ? r2.json() : null))
                .then((u) => {
                  if (u) setUser(u);
                  else {
                    // Second try failed, logout to clean state
                    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
                  }
                })
                .catch(() => setUser(null));
            }, 500);
          }
        }
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUser();
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

  return (
    <AuthContext.Provider value={{ user, isLoading, setUser: handleSetUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

const noopSetUser = () => {};
const noopRefreshUser = async () => {};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  return ctx ?? { user: null, isLoading: false, setUser: noopSetUser, refreshUser: noopRefreshUser };
}
