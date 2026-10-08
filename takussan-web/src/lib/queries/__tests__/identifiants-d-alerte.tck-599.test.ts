/**
 * TCK-599 — un identifiant qui finit dans un CHEMIN d'API est contrôlé avant d'y être écrit.
 *
 * Trois sources : la page de désinscription (paramètres d'URL, donc de n'importe qui), le favori
 * et la recherche sauvegardée (réponses de l'API, mais lus par des appelants non typés). Une
 * valeur `../` ou `?` changerait la ressource visée : `../admin` après `/api/saved-searches/`,
 * ou `1?x=` qui ferait de la signature un paramètre ignoré. Chacune est refusée — et la forme
 * valide passe, sans quoi le contrôle serait un refus universel.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';

import { cheminFavori } from '../favorites';
import { cheminRecherche } from '../saved-searches';
import { lireLienDeCompte, unsubscribeAccountSearch } from '../public-search-alerts';

const SIGNATURE = 'a'.repeat(64);
const HOSTILES: unknown[] = ['../1', '1?x=1', '1/../2', '%2e%2e', '', ' 1', '1.5', '-1', '0', 'NaN', '1e21', '9007199254740993'];

describe('lireLienDeCompte — la page de désinscription d’un compte', () => {
  it('accepte la forme émise par l’API', () => {
    expect(lireLienDeCompte({ search: '42', expires: '1791000000', signature: SIGNATURE })).toEqual({
      searchId: 42,
      expires: '1791000000',
      signature: SIGNATURE,
    });
  });

  it.each(HOSTILES.filter((v): v is string => typeof v === 'string'))('refuse search=%j', (search) => {
    expect(lireLienDeCompte({ search, expires: '1791000000', signature: SIGNATURE })).toBeNull();
  });

  it.each(['../', '1?x', '', 'abc'])('refuse expires=%j', (expires) => {
    expect(lireLienDeCompte({ search: '42', expires, signature: SIGNATURE })).toBeNull();
  });

  it.each(['../' + 'a'.repeat(61), 'a'.repeat(63) + '?', 'A'.repeat(64), 'a'.repeat(65), ''])(
    'refuse une signature hors forme (%#)',
    (signature) => {
      expect(lireLienDeCompte({ search: '42', expires: '1791000000', signature })).toBeNull();
    },
  );
});

describe('unsubscribeAccountSearch — la requête émise', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('POST sur le chemin signé, `expires` puis `signature`, rien d’autre', async () => {
    const appels: { url: string; method: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        appels.push({ url: String(url), method: init?.method ?? 'GET' });
        return new Response(JSON.stringify({ data: {} }), { status: 200 });
      }),
    );

    await unsubscribeAccountSearch({ searchId: 42, expires: '1791000000', signature: SIGNATURE });

    expect(appels).toHaveLength(1);
    expect(appels[0].method).toBe('POST');
    expect(appels[0].url).toMatch(
      new RegExp(`/api/saved-searches/42/unsubscribe\\?expires=1791000000&signature=${SIGNATURE}$`),
    );
  });
});

describe('cheminFavori / cheminRecherche — le segment d’URL d’un favori ou d’une recherche', () => {
  it('écrit un entier sûr', () => {
    expect(cheminFavori(11)).toBe('/api/favorites/11');
    expect(cheminRecherche(7)).toBe('/api/saved-searches/7');
  });

  it.each([...HOSTILES, NaN, 1.5, -1, 0, Number.MAX_SAFE_INTEGER + 2, null, undefined])('refuse %j', (id) => {
    expect(() => cheminFavori(id)).toThrow(RangeError);
    expect(() => cheminRecherche(id)).toThrow(RangeError);
  });
});
