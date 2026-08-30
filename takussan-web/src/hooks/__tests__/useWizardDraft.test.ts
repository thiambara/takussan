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

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * TCK-465 — le sort de l'écriture est RENDU à l'appelant
   * ────────────────────────────────────────────────────────────────────────────────────────────
   *
   * ⚠ Les quatre cas vont ENSEMBLE et aucun ne se suffit. Un hook qui n'enregistrerait plus rien
   * du tout ferait passer « l'échec remonte » ; un hook qui rendrait toujours `ok: true` ferait
   * passer « le succès remonte ». Ce sont les DEUX premiers tests qui, ensemble, disent quelque
   * chose. Les deux suivants tiennent le troisième cas, celui qu'un booléen fait mentir : `flush()`
   * qui n'a RIEN à écrire ne doit pas affirmer un enregistrement qu'il n'a pas mesuré.
   */

  it('flush() rend { ok: true, ecrit: true } quand le PUT aboutit', async () => {
    setupFetchSequence([
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

    let issue: Awaited<ReturnType<typeof result.current.flush>> | undefined;
    await act(async () => {
      issue = await result.current.flush();
    });

    expect(issue).toEqual({ ok: true, ecrit: true });
    expect(result.current.error).toBeNull();
  });

  it("flush() rend { ok: false } quand le PUT échoue, et l'erreur est celle du serveur", async () => {
    setupFetchSequence([
      { status: 404, json: async () => ({}) },
      { status: 500, json: async () => ({ message: 'boom' }) },
    ]);

    const { result } = renderHook(() => useWizardDraft<{ y: number }>('k', { debounceMs: 5000 }));
    await tick();

    act(() => {
      result.current.save(0, { y: 1 });
    });

    let issue: Awaited<ReturnType<typeof result.current.flush>> | undefined;
    await act(async () => {
      issue = await result.current.flush();
    });

    expect(issue?.ok).toBe(false);
    expect(issue).toMatchObject({ ecrit: true });
    expect(issue?.ok === false ? issue.error.message : null).toContain('500');
  });

  it("flush() sans rien en attente rend { ok: true, ecrit: false } — il n'affirme aucune écriture", async () => {
    setupFetchSequence([{ status: 404, json: async () => ({}) }]);

    const { result } = renderHook(() => useWizardDraft<{ y: number }>('k', { debounceMs: 5000 }));
    await tick();

    let issue: Awaited<ReturnType<typeof result.current.flush>> | undefined;
    await act(async () => {
      issue = await result.current.flush();
    });

    expect(issue).toEqual({ ok: true, ecrit: false });
  });

  it("flush() sans rien en attente rend l'ÉCHEC de la dernière sauvegarde débouncée", async () => {
    // Le cas qui fait mentir un booléen : la frappe est partie toute seule au bout du debounce,
    // le PUT a échoué en silence, puis l'utilisateur clique « Reprendre plus tard ». Il n'y a
    // plus rien en attente — et pourtant rien n'est enregistré.
    const fetchMock = setupFetchSequence([
      { status: 404, json: async () => ({}) },
      { status: 503, json: async () => ({}) },
    ]);

    const { result } = renderHook(() => useWizardDraft<{ y: number }>('k', { debounceMs: 20 }));
    await tick();

    act(() => {
      result.current.save(0, { y: 1 });
    });
    await tick(80);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    let issue: Awaited<ReturnType<typeof result.current.flush>> | undefined;
    await act(async () => {
      issue = await result.current.flush();
    });

    // Aucun PUT de plus : `flush()` n'a rien écrit, il RAPPORTE.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(issue).toMatchObject({ ok: false, ecrit: false });
  });

  it('une écriture réussie efface le dernier échec mémorisé', async () => {
    setupFetchSequence([
      { status: 404, json: async () => ({}) },
      { status: 503, json: async () => ({}) },
      {
        status: 200,
        json: async () => ({ data: { id: 1, key: 'k', step: 0, data: { y: 2 }, updated_at: 'now' } }),
      },
    ]);

    const { result } = renderHook(() => useWizardDraft<{ y: number }>('k', { debounceMs: 20 }));
    await tick();

    act(() => {
      result.current.save(0, { y: 1 });
    });
    await tick(80);

    act(() => {
      result.current.save(0, { y: 2 });
    });

    let issue: Awaited<ReturnType<typeof result.current.flush>> | undefined;
    await act(async () => {
      issue = await result.current.flush();
    });
    expect(issue).toEqual({ ok: true, ecrit: true });

    // Et le suivant, qui n'a plus rien à écrire, ne ressort pas l'échec périmé.
    await act(async () => {
      issue = await result.current.flush();
    });
    expect(issue).toEqual({ ok: true, ecrit: false });
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
