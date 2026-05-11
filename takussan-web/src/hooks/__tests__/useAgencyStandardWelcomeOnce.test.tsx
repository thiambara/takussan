import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import { useAgencyStandardWelcomeOnce } from '../useAgencyStandardWelcomeOnce';
import * as AuthContext from '@/context/AuthContext';

type FetchMock = ReturnType<typeof vi.fn>;

/**
 * Maps URL substrings → response bodies. Mirrors the helper used by
 * `useTenantWelcomeOnce.test.tsx` since both hooks parallelise their
 * reads (agency detail + welcome-seen list).
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

function mockAuth(authed: boolean, overrides: Record<string, unknown> = {}) {
  const value = authed
    ? {
        user: {
          id: 1,
          name: 'Admin',
          email: 'a@b.c',
          roles: ['agency_admin'],
          agency_id: 42,
          ...overrides,
        },
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

describe('useAgencyStandardWelcomeOnce', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing when the user is anonymous', async () => {
    mockAuth(false);
    const fetchMock = setupFetchMap({});

    const { result } = renderHook(() => useAgencyStandardWelcomeOnce());
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 10));
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.open).toBe(false);
    expect(result.current.agencyId).toBeNull();
  });

  it('skips when the user is not an agency_admin', async () => {
    mockAuth(true, { roles: ['agent'] });
    const fetchMock = setupFetchMap({});

    const { result } = renderHook(() => useAgencyStandardWelcomeOnce());
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 10));
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.open).toBe(false);
  });

  it('opens the modale when agency is standard, marker is set, and key is unseen', async () => {
    mockAuth(true);
    setupFetchMap({
      '/api/agencies/42': {
        body: {
          data: {
            id: 42,
            kind: 'standard',
            metadata: { welcome: { standard_unlocked_at: '2026-05-10T12:00:00Z' } },
          },
        },
      },
      '/api/me/welcome-seen': { body: { data: [] } },
    });

    const { result } = renderHook(() => useAgencyStandardWelcomeOnce());

    await waitFor(() => expect(result.current.open).toBe(true));
    expect(result.current.agencyId).toBe(42);
  });

  it('does NOT open the modale when the welcome key has already been seen', async () => {
    mockAuth(true);
    setupFetchMap({
      '/api/agencies/42': {
        body: {
          data: {
            id: 42,
            kind: 'standard',
            metadata: { welcome: { standard_unlocked_at: '2026-05-10T12:00:00Z' } },
          },
        },
      },
      '/api/me/welcome-seen': { body: { data: ['agency-standard-welcome-42'] } },
    });

    const { result } = renderHook(() => useAgencyStandardWelcomeOnce());
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 10));
    });

    expect(result.current.open).toBe(false);
    expect(result.current.agencyId).toBeNull();
  });

  it('does NOT open the modale when the agency has no welcome marker (always-standard agency)', async () => {
    mockAuth(true);
    setupFetchMap({
      '/api/agencies/42': {
        body: { data: { id: 42, kind: 'standard', metadata: {} } },
      },
      '/api/me/welcome-seen': { body: { data: [] } },
    });

    const { result } = renderHook(() => useAgencyStandardWelcomeOnce());
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 10));
    });

    expect(result.current.open).toBe(false);
  });

  it('does NOT open when the agency is still individual', async () => {
    mockAuth(true);
    setupFetchMap({
      '/api/agencies/42': {
        body: {
          data: {
            id: 42,
            kind: 'individual',
            metadata: { welcome: { standard_unlocked_at: '2026-05-10T12:00:00Z' } },
          },
        },
      },
      '/api/me/welcome-seen': { body: { data: [] } },
    });

    const { result } = renderHook(() => useAgencyStandardWelcomeOnce());
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 10));
    });

    expect(result.current.open).toBe(false);
  });

  it('POSTs the welcome key on dismiss and closes locally; never re-opens within the session', async () => {
    mockAuth(true);
    const fetchMock = setupFetchMap({
      '/api/agencies/42': {
        body: {
          data: {
            id: 42,
            kind: 'standard',
            metadata: { welcome: { standard_unlocked_at: '2026-05-10T12:00:00Z' } },
          },
        },
      },
      '/api/me/welcome-seen': { body: { data: [] } },
    });

    const { result } = renderHook(() => useAgencyStandardWelcomeOnce());
    await waitFor(() => expect(result.current.open).toBe(true));

    act(() => {
      result.current.onSkip();
      result.current.onSkip();
      result.current.onComplete();
    });

    await waitFor(() => expect(result.current.open).toBe(false));
    expect(result.current.agencyId).toBeNull();

    // 2 reads + exactly 1 POST (de-duplicated by the acknowledgedRef guard).
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const postCalls = fetchMock.mock.calls.filter(
      (c) => (c[1] as { method?: string } | undefined)?.method === 'POST',
    );
    expect(postCalls).toHaveLength(1);
    expect(JSON.parse(postCalls[0][1].body as string)).toEqual({
      key: 'agency-standard-welcome-42',
    });
  });
});

// Required so the file is parsed as a module under tsconfig "isolatedModules".
export {};
