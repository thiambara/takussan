// @vitest-environment node
/**
 * TCK-2721 (AC5) — le relais d'export laisse passer le REGISTRE des encaissements
 * (`payment_history`) avec ses `filter[…]` et son tri, et eux seuls : une liste fermée, jamais la
 * requête recopiée. Les autres entités ne reçoivent toujours que `format`, `from`, `to`, `limit`.
 */
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (nom: string) => (nom === 'auth_token' ? { value: 'jeton-A' } : undefined) }),
}));

const { GET } = await import('../route');

afterEach(() => {
  vi.unstubAllGlobals();
});

async function relayer(entity: string, requete: string): Promise<URL> {
  const fetchSpy = vi.fn(async () => new Response('id\n', { status: 200, headers: { 'content-type': 'text/csv' } }));
  vi.stubGlobal('fetch', fetchSpy);
  const res = await GET(new NextRequest(`http://localhost/api/export/${entity}?${requete}`), { params: Promise.resolve({ entity }) });
  expect(res.status).toBe(200);
  return new URL(String((fetchSpy.mock.calls[0] as unknown[])[0]));
}

describe('GET /api/export/[entity] — le registre des encaissements (TCK-2721)', () => {
  it('AC5 — transmet le filtre d’entité, les bornes d’encaissement, les filtres métier et le tri', async () => {
    const amont = await relayer(
      'payment_history',
      'format=csv&filter[entity_type]=lease&filter[entity_id]=7&filter[paid_from]=2026-11-01&filter[paid_to]=2026-11-30'
        + '&filter[payer_id]=3&filter[landlord_id]=4&filter[payment_method]=wave,cash&filter[search]=awa&filter[status]=paid&sort=-date',
    );

    expect(amont.pathname).toBe('/api/export/payment_history');
    expect(Object.fromEntries(amont.searchParams)).toEqual({
      format: 'csv',
      'filter[entity_type]': 'lease',
      'filter[entity_id]': '7',
      'filter[paid_from]': '2026-11-01',
      'filter[paid_to]': '2026-11-30',
      'filter[payer_id]': '3',
      'filter[landlord_id]': '4',
      'filter[payment_method]': 'wave,cash',
      'filter[search]': 'awa',
      'filter[status]': 'paid',
      sort: '-date',
    });
  });

  it('ne recopie pas la requête : une clé hors de la liste fermée reste au relais', async () => {
    const amont = await relayer('payment_history', 'format=csv&filter[entity_type]=lease&filter[agency_id]=99&include=secrets&profile_id=5');

    expect(amont.searchParams.get('filter[entity_type]')).toBe('lease');
    expect(amont.searchParams.has('filter[agency_id]')).toBe(false);
    expect(amont.searchParams.has('include')).toBe(false);
    expect(amont.searchParams.has('profile_id')).toBe(false);
  });

  it('les autres entités ne reçoivent toujours aucun filter[…]', async () => {
    const amont = await relayer('payments', 'format=csv&from=2026-11-01&filter[entity_type]=lease&sort=-date');

    expect(Object.fromEntries(amont.searchParams)).toEqual({ format: 'csv', from: '2026-11-01' });
  });
});
