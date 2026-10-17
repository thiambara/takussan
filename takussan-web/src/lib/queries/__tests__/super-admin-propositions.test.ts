import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { agirSurProposition, ciblesDeFusion, listerPropositions } from '../super-admin-propositions';

/**
 * TCK-633 (AC5) — les files de propositions parlent au relais `/api/super-admin/…` (→
 * `/api/admin/…`), filtrent CÔTÉ SERVEUR, et un geste est une requête.
 */
const fetchMock = vi.fn();

function reponse(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

function meta(page: number, last: number) {
  return { total: 0, per_page: 100, current_page: page, last_page: last };
}

/** L'URL et les paramètres d'un appel, décodés. */
function appel(n: number): { chemin: string; params: Record<string, string>; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit];
  const u = new URL(url, 'http://test');
  return { chemin: u.pathname, params: Object.fromEntries(u.searchParams), init };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('listerPropositions', () => {
  it('lit les quartiers EN ATTENTE, par le relais, et les met à la forme commune', async () => {
    fetchMock.mockResolvedValueOnce(reponse({
      data: [{
        id: 7, name: 'Liberté 7', slug: 'liberte-7', status: 'pending', origin: 'proposed',
        city: { id: 3, name: 'Dakar' }, region: { id: 1, name: 'Dakar' },
        created_by: { id: 9, name: 'Awa Diop' }, addresses_count: 2, created_at: '2026-10-12T10:00:00+00:00',
        similar: [{ id: 2, name: 'Liberté 6' }],
      }],
      meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    }));

    const page = await listerPropositions('geo', 2);

    const { chemin, params, init } = appel(0);
    expect(chemin).toBe('/api/super-admin/geo/neighborhoods');
    expect(params).toEqual({ 'filter[status]': 'pending', page: '2', per_page: '20' });
    expect(init.credentials).toBe('include');
    expect(page.data).toEqual([{ id: 7, name: 'Liberté 7', auteur: 'Awa Diop', usage: 2, lieu: 'Dakar · Dakar', villeId: 3, proches: ['Liberté 6'] }]);
    expect(page.meta.total).toBe(1);
  });

  it('lit les équipements en attente — un auteur sans nom n’est pas affiché', async () => {
    fetchMock.mockResolvedValueOnce(reponse({
      data: [{ id: 4, name: 'Puits', slug: 'puits', type: 'amenity', status: 'pending', created_by: { id: 2, name: ' ' }, properties_count: 1, created_at: null }],
      meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    }));

    const page = await listerPropositions('tags', 1);

    expect(appel(0).chemin).toBe('/api/super-admin/tags/proposals');
    expect(appel(0).params['filter[status]']).toBe('pending');
    expect(page.data).toEqual([{ id: 4, name: 'Puits', auteur: null, usage: 1, lieu: null, villeId: null, proches: [] }]);
  });

  it('une erreur de l’API remonte (la file affiche son état d’erreur)', async () => {
    fetchMock.mockResolvedValueOnce(reponse({ message: 'Forbidden' }, 403));
    await expect(listerPropositions('geo', 1)).rejects.toMatchObject({ status: 403 });
  });
});

describe('ciblesDeFusion', () => {
  it('quartiers : les APPROUVÉS de la même ville, triés, TOUTES les pages (Dakar en compte plus de 100)', async () => {
    fetchMock
      .mockResolvedValueOnce(reponse({ data: [{ id: 1, name: 'Almadies' }], meta: meta(1, 2) }))
      .mockResolvedValueOnce(reponse({ data: [{ id: 2, name: 'Yoff' }], meta: meta(2, 2) }));

    const cibles = await ciblesDeFusion('geo', 3);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(appel(0).params).toEqual({ 'filter[status]': 'approved', 'filter[geo_city_id]': '3', sort: 'name', per_page: '100', page: '1' });
    expect(appel(1).params.page).toBe('2');
    expect(cibles).toEqual([{ value: '1', label: 'Almadies' }, { value: '2', label: 'Yoff' }]);
  });

  it('équipements : les approuvés, sans filtre de ville ; un quartier sans ville n’appelle rien', async () => {
    fetchMock.mockResolvedValueOnce(reponse({ data: [{ id: 5, name: 'Piscine' }], meta: meta(1, 1) }));

    expect(await ciblesDeFusion('tags', null)).toEqual([{ value: '5', label: 'Piscine' }]);
    expect(appel(0).chemin).toBe('/api/super-admin/tags/proposals');
    expect(appel(0).params['filter[geo_city_id]']).toBeUndefined();

    expect(await ciblesDeFusion('geo', null)).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('agirSurProposition', () => {
  it.each([
    ['geo', { type: 'approve' }, 'POST', '/api/super-admin/geo/neighborhoods/7/approve', undefined],
    ['geo', { type: 'reject' }, 'POST', '/api/super-admin/geo/neighborhoods/7/reject', undefined],
    ['geo', { type: 'rename', name: 'Liberté 6' }, 'PATCH', '/api/super-admin/geo/neighborhoods/7', { name: 'Liberté 6' }],
    ['geo', { type: 'merge', intoId: 2 }, 'POST', '/api/super-admin/geo/neighborhoods/7/merge', { into_id: 2 }],
    ['tags', { type: 'approve' }, 'POST', '/api/super-admin/tags/7/approve', undefined],
    ['tags', { type: 'merge', intoId: 5 }, 'POST', '/api/super-admin/tags/7/merge', { into_id: 5 }],
  ] as const)('%s %j → %s %s', async (genre, geste, methode, chemin, corps) => {
    fetchMock.mockResolvedValueOnce(reponse({ data: {} }));

    await agirSurProposition(genre, 7, geste);

    const a = appel(0);
    expect(a.chemin).toBe(chemin);
    expect(a.init.method).toBe(methode);
    expect(a.init.body === undefined ? undefined : JSON.parse(String(a.init.body))).toEqual(corps);
  });

  it('un refus de l’API (422) est levé, avec son corps', async () => {
    fetchMock.mockResolvedValueOnce(reponse({ code: 'geo.merge_other_city' }, 422));
    await expect(agirSurProposition('geo', 7, { type: 'merge', intoId: 2 })).rejects.toMatchObject({ status: 422, data: { code: 'geo.merge_other_city' } });
  });
});
