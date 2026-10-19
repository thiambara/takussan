import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';

import { useTenantWelcomeOnce } from '../useTenantWelcomeOnce';
import * as AuthContext from '@/context/AuthContext';
import * as Api from '@/lib/api';

/**
 * TCK-968 (P48.01) — les baux actifs se lisent par `apiRequest` (l'API Laravel). Le serveur Next
 * n'a aucun relais `/api/leases` : le faux `fetch` y rend 404, comme lui. Le faux d'avant servait
 * `/api/leases` par `fetch`, et gardait vert un hook qui n'ouvrait jamais la modale.
 */
function mockLeases(ids: number[]) {
  return vi.spyOn(Api, 'apiRequest').mockImplementation((async (chemin: string) => {
    if (chemin.startsWith('/api/leases')) return { data: ids.map((id) => ({ id })) };
    throw new Error(`apiRequest inattendu : ${chemin}`);
  }) as never);
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="fr" messages={{}}>
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

type FetchMock = ReturnType<typeof vi.fn>;

/**
 * Mock helper that maps URL substrings → response bodies. Lets each test
 * declare what `/api/leases` and `/api/me/welcome-seen` should return
 * without caring about the call ordering (the hook fires both in parallel).
 */
function setupFetchMap(routes: Record<string, { status?: number; body?: unknown }>): FetchMock {
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const match = Object.keys(routes).find((needle) => url.includes(needle));
    const route = match ? routes[match] : { status: 404, body: {} };
    return {
      ok: (route.status ?? 200) >= 200 && (route.status ?? 200) < 300,
      status: route.status ?? 200,
      json: async () => route.body ?? {},
    };
  });
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

function mockAuth(authed: boolean) {
  const value = authed
    ? {
        user: { id: 1, name: 'Alice', email: 'a@b.c' },
        token: 'tk',
        isLoading: false,
        setUser: vi.fn(),
        refreshUser: vi.fn(),
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
      }
    : {
        user: null,
        token: null,
        isLoading: false,
        setUser: vi.fn(),
        refreshUser: vi.fn(),
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
      };
  vi.spyOn(AuthContext, 'useAuth').mockReturnValue(
    value as unknown as ReturnType<typeof AuthContext.useAuth>,
  );
}

describe('useTenantWelcomeOnce', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing when the user is anonymous', async () => {
    mockAuth(false);
    const fetchMock = setupFetchMap({});
    const api = mockLeases([42]);

    const { result } = renderHook(() => useTenantWelcomeOnce(), { wrapper });
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 10));
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
    expect(result.current.open).toBe(false);
    expect(result.current.currentLeaseId).toBeNull();
  });

  it('opens the modale for an active lease that has not been seen', async () => {
    mockAuth(true);
    mockLeases([42]);
    setupFetchMap({
      '/api/me/welcome-seen': { body: { data: ['customer-welcome'] } },
    });

    const { result } = renderHook(() => useTenantWelcomeOnce(), { wrapper });

    await waitFor(() => expect(result.current.open).toBe(true));
    expect(result.current.currentLeaseId).toBe(42);
  });

  it('does NOT open the modale when the lease key has already been seen', async () => {
    mockAuth(true);
    mockLeases([7]);
    setupFetchMap({
      '/api/me/welcome-seen': { body: { data: ['tenant-welcome-7'] } },
    });

    const { result } = renderHook(() => useTenantWelcomeOnce(), { wrapper });
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 10));
    });

    expect(result.current.open).toBe(false);
    expect(result.current.currentLeaseId).toBeNull();
  });

  it('queues multiple unseen leases and serialises them', async () => {
    mockAuth(true);
    mockLeases([1, 2]);
    const fetchMock = setupFetchMap({
      '/api/me/welcome-seen': { body: { data: [] } },
    });

    const { result } = renderHook(() => useTenantWelcomeOnce(), { wrapper });
    await waitFor(() => expect(result.current.currentLeaseId).toBe(1));

    act(() => {
      result.current.onComplete();
    });

    await waitFor(() => expect(result.current.currentLeaseId).toBe(2));

    act(() => {
      result.current.onSkip();
    });

    await waitFor(() => expect(result.current.open).toBe(false));
    expect(result.current.currentLeaseId).toBeNull();

    // 1 read (seen ; the leases go through apiRequest) + 1 POST per lease = 3 fetch calls.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const postCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST');
    expect(postCalls).toHaveLength(2);
    expect(JSON.parse(postCalls[0][1].body as string)).toEqual({ key: 'tenant-welcome-1' });
    expect(JSON.parse(postCalls[1][1].body as string)).toEqual({ key: 'tenant-welcome-2' });
  });

  it('POSTs only once per lease even on rapid repeated dismissals', async () => {
    mockAuth(true);
    mockLeases([5]);
    const fetchMock = setupFetchMap({
      '/api/me/welcome-seen': { body: { data: [] } },
    });

    const { result } = renderHook(() => useTenantWelcomeOnce(), { wrapper });
    await waitFor(() => expect(result.current.currentLeaseId).toBe(5));

    act(() => {
      result.current.onSkip();
      result.current.onSkip();
      result.current.onComplete();
    });

    // 1 read (seen) + 1 POST = 2 fetch calls.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const postCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST');
    expect(postCalls).toHaveLength(1);
  });
});

// Required so the file is parsed as a module under tsconfig "isolatedModules".
export {};
