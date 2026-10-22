/**
 * TCK-1178 (P100.01) — l'échéancier d'un bail lit TOUTES ses échéances, page par page.
 *
 * Avant : une seule page de 100, triée par l'API du plus récent au plus ancien. Un bail de plus de
 * 100 échéances perdait les plus anciennes, celles qui tombent en retard les premières : ni
 * l'échéancier, ni le compte des retards, ni le dialogue d'encaissement ne les voyaient. Le serveur
 * est bouchonné comme l'API : 100 lignes au plus par page, dans l'ordre demandé.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchAllLeasePayments, LEASE_PAYMENTS_PER_PAGE } from '../leases';

const TOTAL = 110;
const echeances = Array.from({ length: TOTAL }, (_, i) => ({
  id: i + 1,
  due_date: `${2015 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-05`,
  status: i < 3 ? 'late' : 'pending',
}));

describe('fetchAllLeasePayments', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('suit les pages jusqu’à la dernière : la plus ancienne échéance, en retard, est rendue', async () => {
    const urls: URL[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = new URL(String(url), 'http://api.test');
        urls.push(u);
        const perPage = Math.min(Number(u.searchParams.get('per_page') ?? 20), 100);
        const page = Number(u.searchParams.get('page') ?? 1);
        const tri = u.searchParams.get('sort') === 'due_date' ? echeances : [...echeances].reverse();
        return new Response(
          JSON.stringify({
            data: tri.slice((page - 1) * perPage, page * perPage),
            meta: { current_page: page, last_page: Math.ceil(TOTAL / perPage), per_page: perPage, total: TOTAL },
          }),
          { status: 200 },
        );
      }),
    );

    const res = await fetchAllLeasePayments(7, { token: 'jeton' });

    expect(res.data).toHaveLength(TOTAL);
    expect(res.data[0]).toMatchObject({ id: 1, status: 'late' });
    expect(res.data.filter((p) => p.status === 'late')).toHaveLength(3);
    expect(res.meta.total).toBe(TOTAL);
    expect(urls.map((u) => u.searchParams.get('page'))).toEqual(['1', '2']);
    expect(urls.every((u) => u.pathname === '/api/leases/7/payments')).toBe(true);
    expect(urls.every((u) => u.searchParams.get('sort') === 'due_date')).toBe(true);
    expect(LEASE_PAYMENTS_PER_PAGE).toBe(100);
  });
});
