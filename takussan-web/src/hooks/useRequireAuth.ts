'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { User } from '@/lib/auth';

type UseRequireAuthOptions = {
  /** Where to send unauthenticated users. Defaults to `/auth/login`. */
  redirectTo?: string;
};

type UseRequireAuthResult = {
  user: User | null;
  isLoading: boolean;
};

/**
 * Client-side guard: if there is no authenticated user once loading settles,
 * redirect to `/auth/login?redirect=<current-path>`. The `proxy.ts` middleware
 * already handles the server-side redirect — this hook is a belt-and-braces
 * guard for client-only screens (e.g. modals, post-hydration states) and
 * exposes the typed user for convenience.
 */
export function useRequireAuth(options: UseRequireAuthOptions = {}): UseRequireAuthResult {
  const { redirectTo = '/auth/login' } = options;
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (isLoading) return;
    if (user) return;

    const currentPath = pathname
      ? `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ''}`
      : '/app';

    const target = new URL(redirectTo, 'http://placeholder');
    target.searchParams.set('redirect', currentPath);

    router.replace(`${target.pathname}${target.search}`);
  }, [user, isLoading, pathname, searchParams, redirectTo, router]);

  return { user, isLoading };
}
