/**
 * TCK-2645 — une révision de loyer réécrit les loyers en attente à partir de la date d'effet
 * (`RentReviewService::rewriteUpcomingRentPayments`) : la mutation relit l'échéancier de la fiche,
 * sans quoi la carte Loyer et la liste montreraient l'ancien montant jusqu'au prochain rechargement.
 */
import { describe, expect, it, vi } from 'vitest';

const useApiMutation = vi.fn();
vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: vi.fn(),
  useApiMutation: (...args: unknown[]) => useApiMutation(...args),
}));

const { useReviewLeaseRent } = await import('../leases');

describe('useReviewLeaseRent — ce que la révision relit (TCK-2645)', () => {
  it('PATCH /api/leases/{id}/rent, puis la liste, le bail ET ses échéances', () => {
    useReviewLeaseRent(4);
    const [requete, options] = useApiMutation.mock.calls[0] as [{ path: string; method: string }, { invalidate: unknown[] }];
    expect(requete).toMatchObject({ path: '/api/leases/4/rent', method: 'PATCH' });
    expect(options.invalidate).toEqual(
      expect.arrayContaining([
        ['leases', 'list'],
        ['leases', 'detail', 4],
        ['leases', 'payments', 4],
      ]),
    );
  });
});
