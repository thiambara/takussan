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

const DEFAULT_REDIRECT = '/auth/login';

/**
 * Ensure `candidate` is a safe same-origin path. Rejects:
 * - protocol-relative URLs (`//evil.com/foo`)
 * - absolute URLs with a scheme (`https://evil.com`, `javascript:...`) —
 *   detected by a `:` appearing before the first `/`
 * - relative paths that don't start with `/`
 *
 * Falls back to {@link DEFAULT_REDIRECT} on any violation so redirects
 * stay resilient even if a future caller wires this to untrusted input
 * (e.g. a query param).
 */
function sanitizeRedirectPath(candidate: string): string {
  if (!candidate || typeof candidate !== 'string') return DEFAULT_REDIRECT;
  if (candidate.startsWith('//')) return DEFAULT_REDIRECT;
  if (!candidate.startsWith('/')) return DEFAULT_REDIRECT;

  const firstSlash = candidate.indexOf('/', 1);
  const colonIndex = candidate.indexOf(':');
  if (colonIndex !== -1 && (firstSlash === -1 || colonIndex < firstSlash)) {
    return DEFAULT_REDIRECT;
  }

  return candidate;
}

/**
 * Client-side guard: if there is no authenticated user once loading settles,
 * redirect to `/auth/login?redirect=<current-path>`. The `proxy.ts` middleware
 * already handles the server-side redirect — this hook is a belt-and-braces
 * guard for client-only screens (e.g. modals, post-hydration states) and
 * exposes the typed user for convenience.
 */
export function useRequireAuth(options: UseRequireAuthOptions = {}): UseRequireAuthResult {
  const { redirectTo = DEFAULT_REDIRECT } = options;
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

    const safePath = sanitizeRedirectPath(redirectTo);
    const target = new URL(safePath, 'http://placeholder');
    target.searchParams.set('redirect', currentPath);

    router.replace(`${target.pathname}${target.search}`);
  }, [user, isLoading, pathname, searchParams, redirectTo, router]);

  return { user, isLoading };
}
