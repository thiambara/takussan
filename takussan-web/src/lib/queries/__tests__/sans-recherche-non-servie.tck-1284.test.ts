import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUseApiQuery = vi.fn();

vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (...args: unknown[]) => mockUseApiQuery(...args),
  useApiMutation: vi.fn(),
}));

const { useLeases } = await import('@/lib/queries/leases');
const { useInvoices } = await import('@/lib/queries/payments');

/**
 * P150.03 (TCK-1284) — `GET /api/leases` et `/api/invoices` ne déclarent aucun filtre `search` :
 * un `filter[search]` y rend 400. Les deux hooks n'offrent plus ce paramètre, ni dans leur type
 * (les `@ts-expect-error`, que `tsc --noEmit` juge) ni dans la requête.
 *
 * TCK-2594 — `/api/bookings` en sert un depuis TCK-2593 (référence, client, bien) : `useBookings`
 * l'envoie (`bookings.trois-natures.tck-2594.test.ts`) et quitte ce fichier.
 */
describe('hooks sans recherche que l’API ne sert pas', () => {
  beforeEach(() => mockUseApiQuery.mockReset());

  const filtreEnvoye = () => {
    const options = mockUseApiQuery.mock.calls[0][2] as { params: { filter?: Record<string, unknown> } };
    return options.params.filter ?? {};
  };

  it('useLeases', () => {
    // @ts-expect-error — `search` ne fait plus partie de UseLeasesParams
    useLeases({ status: 'active', search: 'x' });
    expect(filtreEnvoye()).toEqual({ status: 'active' });
  });

  it('useInvoices', () => {
    // @ts-expect-error — `search` ne fait plus partie de UseInvoicesParams
    useInvoices({ customer_id: 3, search: 'x' });
    expect(filtreEnvoye()).toEqual({ customer_id: 3 });
  });
});
