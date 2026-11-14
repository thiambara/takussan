import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RACINE_DU_DEPOT } from './attributs-calcules-de-l-api';

/**
 * TCK-2589 — le fil d'une fiche client : une page par requête, le filtre de type envoyé au serveur
 * (jamais appliqué sur une page déjà reçue), et les types du front sont exactement ceux que l'API
 * accepte (`CustomerTimeline::TYPES`) : un type de plus rendrait 422 au filtre « Tout ».
 */
const api = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  apiRequest: api.apiRequest,
}));

import { ENTREES_PAR_PAGE, fetchCustomerTimeline, TYPES_DU_FIL } from '../customer-timeline';

beforeEach(() => {
  api.apiRequest.mockReset();
  api.apiRequest.mockResolvedValue({ data: [], meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 } });
});

function url(): URL {
  const [chemin] = api.apiRequest.mock.calls[0] as [string];
  return new URL(chemin, 'http://x');
}

describe('fetchCustomerTimeline', () => {
  it('sans filtre : la première page, sans filter[type]', async () => {
    await fetchCustomerTimeline('jeton', 7);
    expect(url().pathname).toBe('/api/customers/7/timeline');
    expect(url().searchParams.get('page')).toBe('1');
    expect(url().searchParams.get('per_page')).toBe(String(ENTREES_PAR_PAGE));
    expect(url().searchParams.has('filter[type]')).toBe(false);
    expect((api.apiRequest.mock.calls[0] as [string, { token: string }])[1].token).toBe('jeton');
  });

  it('le filtre part au serveur, avec la page demandée', async () => {
    await fetchCustomerTimeline('jeton', 7, { types: ['visit'], page: 3 });
    expect(url().searchParams.get('filter[type]')).toBe('visit');
    expect(url().searchParams.get('page')).toBe('3');
  });

  it('les types du front sont ceux de l’API, ni plus ni moins', () => {
    const php = readFileSync(join(RACINE_DU_DEPOT, 'takussan-api/app/Services/Crm/CustomerTimeline.php'), 'utf8');
    const ligne = php.match(/public const TYPES = \[([^\]]*)\];/);
    expect(ligne, 'CustomerTimeline::TYPES introuvable').not.toBeNull();
    const types = [...ligne![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect([...TYPES_DU_FIL]).toEqual(types);
  });
});
