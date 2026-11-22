import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchUpcomingOwnerPayouts } from '../reversements-a-venir';

/**
 * TCK-595 (AC4 bis), porté de `overview/__tests__/bailleur.tck-595.test.tsx` quand la vue du bailleur est
 * devenue un onglet de « Rapports » (TCK-2628) : les versements AU BAILLEUR encore à venir, selon l'API.
 */
const appels = vi.hoisted(() => ({ urls: [] as string[], jeton: 'jeton' as string | null }));
vi.mock('@/lib/session', () => ({ getToken: vi.fn(async () => appels.jeton) }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: vi.fn(async (url: string) => {
    appels.urls.push(url);
    return { data: [{ id: 1 }] };
  }),
}));

beforeEach(() => {
  appels.urls = [];
  appels.jeton = 'jeton';
});

describe('fetchUpcomingOwnerPayouts', () => {
  // TCK-1804 (P162.07) : « à venir » se lit à l'API (`PayoutStatus::upcoming()`), attente d'approbation
  // comprise, et non par une liste de statuts recopiée ici.
  it('ne demande que les versements au bailleur encore à venir, selon l’API', async () => {
    expect(await fetchUpcomingOwnerPayouts(7)).toEqual([{ id: 1 }]);
    const params = new URLSearchParams(appels.urls[0]!.split('?')[1]);
    expect(params.get('filter[landlord_id]')).toBe('7');
    expect(params.get('filter[payee_role]')).toBe('landlord');
    expect(params.get('filter[upcoming]')).toBe('1');
    expect(params.get('filter[status]')).toBeNull();
    expect(params.get('fields[payouts]')).toBe('id,reference_number,landlord_id,status,net_amount,currency,scheduled_at,created_at');
  });

  it('sans jeton, rien n’est lu', async () => {
    appels.jeton = null;
    expect(await fetchUpcomingOwnerPayouts(7)).toEqual([]);
    expect(appels.urls).toEqual([]);
  });
});
