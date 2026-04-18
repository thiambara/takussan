'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User } from '@/lib/auth';

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children, initialUser }: { children: React.ReactNode; initialUser?: User | null }) {
  const [user, setUser] = useState<User | null>(initialUser ?? null);
  const [isLoading, setIsLoading] = useState(initialUser === undefined);

  useEffect(() => {
    if (initialUser !== undefined) return;
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, [initialUser]);

  const handleSetUser = useCallback((u: User | null) => setUser(u), []);

  return (
    <AuthContext.Provider value={{ user, isLoading, setUser: handleSetUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
