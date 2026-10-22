// @vitest-environment node
/**
 * TCK-1219 (P79.04) — un relais BFF dont l'API ne répond pas rend une réponse JSON portant un code,
 * sous une borne, et l'abandon d'une lecture par le navigateur remonte à l'API.
 *
 * Avant : ni délai, ni `catch`, ni `request.signal`. Une API arrêtée faisait lever le handler (la
 * 500 de Next, sans `code` pour `messageCorpsErreurBff`), une API figée le faisait attendre 300 s,
 * et un onglet fermé laissait l'appel amont tourner.
 */
import { readFileSync, globSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ get: (nom: string) => (nom === 'auth_token' ? { value: '1|abc' } : undefined) })),
}));

import { CODES_ERREUR_BFF } from '@/lib/api';
import { DELAI_RELAIS_FICHIER_MS, fetchVersApi, relayerVersApi } from '@/lib/relais-api';

const fetchMock = vi.fn();

/** Une API figée : le `fetch` ne rejette qu'à l'abandon de son signal. */
function apiFigee(_url: unknown, init?: RequestInit): Promise<Response> {
  return new Promise((_resoudre, rejeter) => {
    init?.signal?.addEventListener('abort', () => rejeter(init.signal?.reason), { once: true });
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('codes de panne amont', () => {
  it('sont déclarés dans CODES_ERREUR_BFF', () => {
    expect(CODES_ERREUR_BFF).toContain('upstream_unavailable');
    expect(CODES_ERREUR_BFF).toContain('upstream_timeout');
  });
});

describe('fetchVersApi', () => {
  it('rend 502 { code: upstream_unavailable } quand fetch rejette', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    const reponse = await fetchVersApi('http://api/x', {});

    expect(reponse.status).toBe(502);
    expect(await reponse.json()).toEqual({ code: 'upstream_unavailable' });
  });

  it('rend 504 { code: upstream_timeout } au délai, sur une API figée', async () => {
    fetchMock.mockImplementation(apiFigee);

    const reponse = await fetchVersApi('http://api/x', {}, { delaiMs: 5 });

    expect(reponse.status).toBe(504);
    expect(await reponse.json()).toEqual({ code: 'upstream_timeout' });
  });

  it('relaie la réponse de l\'API telle quelle quand elle répond', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"data":1}', { status: 422 }));

    const reponse = await fetchVersApi('http://api/x', {});

    expect(reponse.status).toBe(422);
  });
});

describe('relayerVersApi', () => {
  it('rend 502 JSON avec son code quand l\'API est injoignable', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    const reponse = await relayerVersApi(new NextRequest('http://localhost/api/agencies/5'), '/agencies/5');

    expect(reponse.status).toBe(502);
    expect(await reponse.json()).toEqual({ code: 'upstream_unavailable' });
  });

  it('l\'abandon d\'une lecture par le navigateur abandonne l\'appel amont', async () => {
    fetchMock.mockImplementation(apiFigee);
    const navigateur = new AbortController();
    const requete = new NextRequest('http://localhost/api/agencies/5', { signal: navigateur.signal });

    const relais = relayerVersApi(requete, '/agencies/5');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    navigateur.abort();
    await relais;

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal?.aborted).toBe(true);
  });

  it('l\'abandon d\'une écriture ne l\'abandonne pas', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const navigateur = new AbortController();
    const requete = new NextRequest('http://localhost/api/agencies/5', {
      method: 'POST',
      body: '{}',
      signal: navigateur.signal,
    });

    await relayerVersApi(requete, '/agencies/5');
    navigateur.abort();

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal?.aborted).toBe(false);
  });
});

describe('relais à fetch direct', () => {
  it('me/payouts rend 502 JSON avec son code quand l\'API est injoignable', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const { GET } = await import('../me/payouts/route');
    const requete = new NextRequest('http://localhost/api/me/payouts', { headers: { cookie: 'auth_token=1|abc' } });

    const reponse = await GET(requete);

    expect(reponse.status).toBe(502);
    expect(await reponse.json()).toEqual({ code: 'upstream_unavailable' });
  });

  it('export attend l\'API jusqu\'au délai long, pas au délai par défaut', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fetchMock.mockImplementation(apiFigee);
    const { GET } = await import('../export/[entity]/route');
    let reglee = false;
    const appel = GET(new NextRequest('http://localhost/api/export/payments?format=csv'), {
      params: Promise.resolve({ entity: 'payments' }),
    }).then((r) => {
      reglee = true;
      return r;
    });

    await vi.advanceTimersByTimeAsync(31_000);
    expect(reglee).toBe(false);
    await vi.advanceTimersByTimeAsync(DELAI_RELAIS_FICHIER_MS);
    expect((await appel).status).toBe(504);
  });

  it('aucun route handler ne fait de fetch direct sans catch', () => {
    // `maintenance/status` relève de P79.06 (TCK-1221).
    const exceptions = ['src/app/api/maintenance/status/route.ts'];
    const fautifs = globSync('src/app/api/**/route.ts')
      .filter((f) => !exceptions.includes(f))
      .filter((f) => {
        const source = readFileSync(f, 'utf8');
        return /(?<![\w.])fetch\(/.test(source) && !/\bcatch\b/.test(source);
      });
    expect(fautifs).toEqual([]);
  });
});
