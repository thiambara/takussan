import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-2589 — la fiche client lit en UNE requête ce qu'elle montre : la ressource entière, ses trois
 * attributs calculés (prochaine action, relance, référent), son origine, ses prochaines visites et
 * les comptes de son dossier. Pas les notes (TCK-866) : le fil les lit.
 */
const api = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  apiRequest: api.apiRequest,
}));

import { fetchFicheDuClient } from '../customers';

beforeEach(() => {
  api.apiRequest.mockReset();
  api.apiRequest.mockResolvedValue({ data: { id: 7 } });
});

describe('fetchFicheDuClient', () => {
  it('demande les seuls attributs calculés, et les inclusions de la fiche', async () => {
    await fetchFicheDuClient('jeton', 7);

    const [chemin, options] = api.apiRequest.mock.calls[0] as [string, { token: string }];
    const url = new URL(chemin, 'http://x');

    expect(url.pathname).toBe('/api/customers/7');
    expect(options.token).toBe('jeton');
    expect(url.searchParams.get('fields[customers]')?.split(',')).toEqual(['next_action', 'follow_up', 'referent']);
    expect(url.searchParams.get('include')?.split(',').sort()).toEqual(
      ['bookingsCount', 'documents', 'interestedProperty', 'leasesCount', 'origin', 'tags', 'upcomingVisits', 'visitsCount'],
    );
    expect(url.searchParams.get('include')).not.toMatch(/\bnotes\b/);
  });
});
