import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

/**
 * TCK-1297 (P113.01) — dans le navigateur, une lecture (`GET`) d'`apiRequest` est bornée à 30 s,
 * la valeur de `DELAI_API_SERVEUR_MS` (TCK-1215), combinée au signal de l'appelant. Chrome ne borne
 * rien lui-même (12 min mesurées sans réponse ni rejet). Les écritures et les envois de fichiers
 * gardent le seul signal de l'appelant (décision du porteur : à décider avec P144.07).
 *
 * Le délai réel n'est pas attendu : `AbortSignal.timeout` est épié, la valeur demandée relevée, et
 * un délai de quelques millisecondes rendu à sa place.
 */
import { apiRequest, DELAI_API_SERVEUR_MS } from '../api';

const timeoutReel = AbortSignal.timeout.bind(AbortSignal);
let delaisDemandes: number[];
let fetchSpy: MockInstance<typeof fetch>;

/** Un `fetch` contre une API figée : il ne se résout jamais, et ne rejette qu'à l'abandon de son signal. */
function apiFigee(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return new Promise((_resoudre, rejeter) => {
    const signal = init?.signal;
    if (!signal) return;
    if (signal.aborted) rejeter(signal.reason);
    signal.addEventListener('abort', () => rejeter(signal.reason), { once: true });
  });
}

function sousLaBorne<T>(promesse: Promise<T>, ms = 1_000): Promise<T> {
  return Promise.race([
    promesse,
    new Promise<T>((_r, rejeter) => setTimeout(() => rejeter(new Error(`toujours en attente après ${ms} ms`)), ms)),
  ]);
}

beforeEach(() => {
  delaisDemandes = [];
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
    delaisDemandes.push(ms);
    return timeoutReel(5);
  });
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(apiFigee);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('délai des lectures du navigateur vers l’API', () => {
  it('le test tourne bien dans le navigateur', () => {
    expect(typeof window).toBe('object');
  });

  it('une lecture rejette sur une API figée, à 30 s', async () => {
    const erreur = await sousLaBorne(apiRequest('/api/me/notifications', { token: 't' }).catch((e: unknown) => e));

    expect((erreur as { name?: string }).name).toBe('TimeoutError');
    expect(delaisDemandes).toEqual([DELAI_API_SERVEUR_MS]);
  });

  it('le signal de l’appelant abandonne toujours la lecture', async () => {
    vi.mocked(AbortSignal.timeout).mockImplementation((ms: number) => {
      delaisDemandes.push(ms);
      return timeoutReel(60_000);
    });
    const appelant = new AbortController();
    const appel = apiRequest('/api/properties', { signal: appelant.signal }).catch((e: unknown) => e);
    appelant.abort(new DOMException('abandon', 'AbortError'));

    const erreur = await sousLaBorne(appel);
    expect((erreur as { name?: string }).name).toBe('AbortError');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('une écriture et un envoi de fichier ne reçoivent pas de borne', () => {
    const appelant = new AbortController();
    void apiRequest('/api/messages', { method: 'POST', body: { a: 1 }, signal: appelant.signal }).catch(() => null);
    void apiRequest('/api/documents', { method: 'POST', body: new FormData(), formData: true }).catch(() => null);

    expect(delaisDemandes).toEqual([]);
    appelant.abort();
  });
});
