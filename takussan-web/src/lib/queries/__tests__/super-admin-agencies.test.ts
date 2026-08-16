import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAdminAgencies, fetchAdminAgencyTeam, fetchAdminUserDetail } from '../super-admin';

function mockFetch(response: unknown) {
  const fakeResponse = {
    ok: true,
    status: 200,
    json: async () => response,
  };
  const spy = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>>(async () => fakeResponse);
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchAdminAgencies', () => {
  it('passes sparse fields, server filters and server sort', async () => {
    const fetchSpy = mockFetch({ data: [], meta: { total: 0, current_page: 1, last_page: 1, per_page: 15 } });

    await fetchAdminAgencies({
      status: 'active',
      search: 'dakar',
      createdFrom: '2026-05-01',
      createdTo: '2026-05-31',
      sort: '-properties_count',
      page: 2,
      perPage: 25,
    });

    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain('fields%5Bagencies%5D=');
    expect(url).toContain('logo_url%2Cproperties_count%2Cmembers_count%2Clast_activity_at');
    expect(url).toContain('filter%5Bstatus%5D=active');
    expect(url).toContain('filter%5Bsearch%5D=dakar');
    expect(url).toContain('filter%5Bcreated_from%5D=2026-05-01');
    expect(url).toContain('filter%5Bcreated_to%5D=2026-05-31');
    expect(url).toContain('sort=-properties_count');
    expect(url).toContain('page=2');
    expect(url).toContain('per_page=25');
  });
});

/**
 * TCK-278 — garde de non-régression.
 *
 * `roles` n'est PLUS une relation Eloquent : `spatie/laravel-permission` est
 * désinstallé. `/api/admin/agencies/{id}/team` est monté sur
 * `User::buildQuery()`, dont `$requestLoadable` vaut
 * `agentProfiles, ownerProfiles, agencyAdminProfiles, platformProfile`.
 * Demander `include=roles` y lève `InvalidIncludeQuery` → **HTTP 400**, pas un
 * champ manquant : le panneau entier ne se charge pas.
 *
 * Le backend renvoie déjà `roles` dans le payload (AgencyDetailController),
 * l'include ne servait donc à rien.
 *
 * Le test backend correspondant (`AgencyDetailTest`) avait été « corrigé » en
 * RETIRANT l'include de la requête — ce qui a désarmé la garde au lieu de la
 * poser. Cette assertion-ci est la garde : elle porte sur l'appelant.
 */
describe('include=roles ne doit plus être demandé (TCK-278)', () => {
  it('fetchAdminAgencyTeam ne passe aucun include', async () => {
    const fetchSpy = mockFetch({ data: [], meta: { total: 0, current_page: 1, last_page: 1, per_page: 10 } });

    await fetchAdminAgencyTeam(42);

    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).not.toContain('include=');
    expect(url).toContain('fields%5Busers%5D=');
    expect(url).toContain('per_page=10');
  });

  it('fetchAdminUserDetail ne passe aucun include', async () => {
    const fetchSpy = mockFetch({ data: { id: 7 } });

    await fetchAdminUserDetail(7);

    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).not.toContain('include=');
    expect(url).toContain('fields%5Busers%5D=');
  });
});
