import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import { useWelcomeOnce } from '../useWelcomeOnce';
import * as AuthContext from '@/context/AuthContext';

type FetchMock = ReturnType<typeof vi.fn>;

function setupFetchSequence(
  responses: Array<{ status?: number; json?: () => Promise<unknown> }>,
): FetchMock {
  const mock = vi.fn();
  responses.forEach((r) => {
    mock.mockImplementationOnce(async () => ({
      ok: (r.status ?? 200) >= 200 && (r.status ?? 200) < 300,
      status: r.status ?? 200,
      json: r.json ?? (async () => ({})),
    }));
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

const SLIDES = [
  { title: 'Hello', body: 'World' },
  { title: 'Step 2', body: 'Body 2' },
];

describe('useWelcomeOnce', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing when the user is anonymous', async () => {
    mockAuth(false);
    const fetchMock = setupFetchSequence([]);

    const { result } = renderHook(() => useWelcomeOnce('customer-welcome', SLIDES));
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 10));
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.open).toBe(false);
  });

  it('opens the modale when the key has not been seen', async () => {
    mockAuth(true);
    setupFetchSequence([
      { status: 200, json: async () => ({ data: ['some-other-key'] }) },
    ]);

    const { result } = renderHook(() => useWelcomeOnce('customer-welcome', SLIDES));

    await waitFor(() => expect(result.current.open).toBe(true));
    expect(result.current.slides).toEqual(SLIDES);
  });

  it('does NOT open the modale when the key was already seen', async () => {
    mockAuth(true);
    setupFetchSequence([
      { status: 200, json: async () => ({ data: ['customer-welcome', 'host-welcome'] }) },
    ]);

    const { result } = renderHook(() => useWelcomeOnce('customer-welcome', SLIDES));
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 10));
    });

    expect(result.current.open).toBe(false);
  });

  it('POSTs the key on completion and closes', async () => {
    mockAuth(true);
    const fetchMock = setupFetchSequence([
      { status: 200, json: async () => ({ data: [] }) },
      { status: 201, json: async () => ({ data: { id: 1, key: 'k', user_id: 1, seen_at: 'now' } }) },
    ]);

    const { result } = renderHook(() => useWelcomeOnce('customer-welcome', SLIDES));
    await waitFor(() => expect(result.current.open).toBe(true));

    act(() => {
      result.current.onComplete();
    });

    expect(result.current.open).toBe(false);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const postCall = fetchMock.mock.calls[1];
    expect(postCall[1].method).toBe('POST');
    expect(JSON.parse(postCall[1].body)).toEqual({ key: 'customer-welcome' });
  });

  it('POSTs only once even if onSkip + onComplete fire back-to-back', async () => {
    mockAuth(true);
    const fetchMock = setupFetchSequence([
      { status: 200, json: async () => ({ data: [] }) },
      { status: 201, json: async () => ({ data: { id: 1, key: 'k', user_id: 1, seen_at: 'now' } }) },
    ]);

    const { result } = renderHook(() => useWelcomeOnce('customer-welcome', SLIDES));
    await waitFor(() => expect(result.current.open).toBe(true));

    act(() => {
      result.current.onSkip();
      result.current.onComplete();
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// Required so the file is parsed as a module under tsconfig "isolatedModules".
export {};
