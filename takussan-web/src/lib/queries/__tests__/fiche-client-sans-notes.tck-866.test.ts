import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-866 (P02.09) — la fiche client ne demande pas `include=notes`. Les notes sont lues paginées
 * par `GET /api/customers/{id}/notes` (page de la fiche, panneau du pipeline) ; l'`include`
 * sérialisait toutes les notes du client une seconde fois, et rien ne lisait ce champ.
 */
const api = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  apiRequest: api.apiRequest,
}));

import { fetchDashboardCustomer } from '../customers';

beforeEach(() => {
  api.apiRequest.mockReset();
  api.apiRequest.mockResolvedValue({ data: { id: 7 } });
});

describe('fetchDashboardCustomer', () => {
  it('charge les documents et les étiquettes, pas les notes', async () => {
    await fetchDashboardCustomer('jeton', 7);

    const [chemin] = api.apiRequest.mock.calls[0] as [string];
    const url = new URL(chemin, 'http://x');

    expect(url.pathname).toBe('/api/customers/7');
    expect(url.searchParams.get('include')?.split(',').sort()).toEqual(['documents', 'tags']);
  });
});
