import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useWizardDraft } from '../useWizardDraft';

/**
 * TCK-2331 (P08.05) — l'enregistrement automatique reprend au retour du réseau.
 *
 * Une sauvegarde débouncée qui échoue pendant une coupure restait perdue : rien n'écoutait
 * `online`, et le brouillon du serveur gardait l'état d'avant tant que la personne ne retapait rien.
 */
type Reponse = { status: number; body?: unknown } | 'coupure';

function brancherFetch(reponses: Reponse[]) {
  const mock = vi.fn();
  for (const r of reponses) {
    mock.mockImplementationOnce(async () => {
      if (r === 'coupure') throw new TypeError('Failed to fetch');
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body ?? {} };
    });
  }
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

async function tick(ms = 50): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  });
}

async function retourDuReseau(): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new Event('online'));
  });
  await tick();
}

const enregistre = (y: number) => ({
  status: 200,
  body: { data: { id: 1, key: 'k', step: 1, data: { y }, updated_at: 'now' } },
});

const puts = (mock: ReturnType<typeof vi.fn>) =>
  mock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PUT');

describe('useWizardDraft — reprise au retour du réseau', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejoue au retour du réseau la dernière sauvegarde échouée', async () => {
    const fetchMock = brancherFetch([{ status: 404 }, 'coupure', enregistre(2)]);
    const { result } = renderHook(() => useWizardDraft<{ y: number }>('k', { debounceMs: 20 }));
    await tick();

    act(() => result.current.save(1, { y: 2 }));
    await tick(80);
    expect(result.current.error).not.toBeNull();
    expect(puts(fetchMock)).toHaveLength(1);

    await retourDuReseau();

    expect(puts(fetchMock)).toHaveLength(2);
    expect(JSON.parse(puts(fetchMock)[1][1].body as string)).toEqual({ step: 1, data: { y: 2 } });
    expect(result.current.error).toBeNull();
    expect(result.current.draft?.data).toEqual({ y: 2 });
  });

  it('sans sauvegarde échouée, le retour du réseau n’envoie rien', async () => {
    const fetchMock = brancherFetch([{ status: 404 }, enregistre(1)]);
    const { result } = renderHook(() => useWizardDraft<{ y: number }>('k', { debounceMs: 20 }));
    await tick();

    act(() => result.current.save(1, { y: 1 }));
    await tick(80);
    await retourDuReseau();

    expect(puts(fetchMock)).toHaveLength(1);
  });

  it('une sauvegarde réussie après l’échec remplace ce qui était à rejouer', async () => {
    const fetchMock = brancherFetch([{ status: 404 }, 'coupure', enregistre(3)]);
    const { result } = renderHook(() => useWizardDraft<{ y: number }>('k', { debounceMs: 20 }));
    await tick();

    act(() => result.current.save(1, { y: 2 }));
    await tick(80);
    act(() => result.current.save(1, { y: 3 }));
    await tick(80);
    await retourDuReseau();

    expect(puts(fetchMock)).toHaveLength(2);
  });

  it('un brouillon effacé ne se rejoue pas', async () => {
    const fetchMock = brancherFetch([{ status: 404 }, 'coupure', { status: 204 }]);
    const { result } = renderHook(() => useWizardDraft<{ y: number }>('k', { debounceMs: 20 }));
    await tick();

    act(() => result.current.save(1, { y: 2 }));
    await tick(80);
    await act(async () => {
      await result.current.clear();
    });
    await retourDuReseau();

    expect(puts(fetchMock)).toHaveLength(1);
  });
});
