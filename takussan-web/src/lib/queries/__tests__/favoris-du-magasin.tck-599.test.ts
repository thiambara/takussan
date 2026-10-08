/**
 * TCK-599 — la synchronisation des cœurs d'un utilisateur connecté (`AuthContext`) lit TOUS ses
 * favoris, page par page, sous la borne de l'API.
 *
 * Avant : un seul `GET /api/favorites?per_page=100`. Depuis AC5, l'API le refuse en 422 (borne
 * 1-50), et l'appelant avalait l'erreur en « best-effort » : les cœurs d'un utilisateur connecté
 * seraient restés vides sans un mot. Le serveur est bouchonné comme l'API réelle : il REFUSE au-delà
 * de 50.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchAllFavoritePropertyIds, FAVORITES_MAX_PER_PAGE } from '../favorites';

describe('fetchAllFavoritePropertyIds', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('suit les pages jusqu’à la dernière, sans jamais dépasser la borne de l’API', async () => {
    const urls: URL[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = new URL(String(url), 'http://api.test');
        urls.push(u);
        const perPage = Number(u.searchParams.get('per_page') ?? 20);
        if (perPage > 50) return new Response(JSON.stringify({ message: 'per_page' }), { status: 422 });
        const page = Number(u.searchParams.get('page') ?? 1);
        const ids = page === 1 ? [1, 2] : page === 2 ? [3] : [];
        return new Response(
          JSON.stringify({ data: ids.map((property_id) => ({ property_id })), meta: { current_page: page, last_page: 2 } }),
          { status: 200 },
        );
      }),
    );

    await expect(fetchAllFavoritePropertyIds('jeton')).resolves.toEqual([1, 2, 3]);
    expect(urls.map((u) => u.searchParams.get('page'))).toEqual(['1', '2']);
    expect(urls.every((u) => Number(u.searchParams.get('per_page')) <= FAVORITES_MAX_PER_PAGE)).toBe(true);
    expect(FAVORITES_MAX_PER_PAGE).toBe(50);
  });
});
