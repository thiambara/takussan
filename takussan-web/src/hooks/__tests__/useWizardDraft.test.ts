import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useWizardDraft } from '../useWizardDraft';

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

async function tick(ms = 50): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  });
}

describe('useWizardDraft', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hydrates from an existing draft on mount', async () => {
    setupFetchSequence([
      {
        status: 200,
        json: async () => ({ data: { id: 1, key: 'k', step: 2, data: { x: 1 }, updated_at: '2026-05-10' } }),
      },
    ]);

    const { result } = renderHook(() => useWizardDraft<{ x: number }>('host-individual-wizard'));
    await tick();

    expect(result.current.isLoading).toBe(false);
    expect(result.current.draft).toEqual({
      id: 1,
      key: 'k',
      step: 2,
      data: { x: 1 },
      updated_at: '2026-05-10',
    });
  });

  it('treats 404 as "no draft yet"', async () => {
    setupFetchSequence([{ status: 404, json: async () => ({ message: 'No draft.' }) }]);

    const { result } = renderHook(() => useWizardDraft('host-individual-wizard'));
    await tick();

    expect(result.current.isLoading).toBe(false);
    expect(result.current.draft).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('debounces save calls into a single PUT', async () => {
    const fetchMock = setupFetchSequence([
      { status: 404, json: async () => ({}) }, // initial GET
      {
        status: 200,
        json: async () => ({ data: { id: 1, key: 'k', step: 1, data: { y: 3 }, updated_at: 'now' } }),
      }, // PUT
    ]);

    const { result } = renderHook(() =>
      useWizardDraft<{ y: number }>('k', { debounceMs: 100 }),
    );
    await tick();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.save(1, { y: 1 });
      result.current.save(1, { y: 2 });
      result.current.save(1, { y: 3 });
    });

    // Right after burst, debounce hasn't fired.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Wait past the debounce.
    await tick(200);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const putCall = fetchMock.mock.calls[1];
    expect(putCall[1].method).toBe('PUT');
    expect(JSON.parse(putCall[1].body)).toEqual({ step: 1, data: { y: 3 } });
  });

  it('flush() forces an immediate PUT and resolves once it settles', async () => {
    const fetchMock = setupFetchSequence([
      { status: 404, json: async () => ({}) },
      {
        status: 200,
        json: async () => ({ data: { id: 1, key: 'k', step: 0, data: { y: 1 }, updated_at: 'now' } }),
      },
    ]);

    const { result } = renderHook(() => useWizardDraft<{ y: number }>('k', { debounceMs: 5000 }));
    await tick();

    act(() => {
      result.current.save(0, { y: 1 });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.flush();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('clear() deletes the draft and resets local state', async () => {
    const fetchMock = setupFetchSequence([
      {
        status: 200,
        json: async () => ({ data: { id: 1, key: 'k', step: 1, data: { y: 1 }, updated_at: 'now' } }),
      },
      { status: 204, json: async () => null },
    ]);

    const { result } = renderHook(() => useWizardDraft<{ y: number }>('k'));
    await tick();
    expect(result.current.draft?.step).toBe(1);

    await act(async () => {
      await result.current.clear();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
    expect(result.current.draft).toBeNull();
  });
});
