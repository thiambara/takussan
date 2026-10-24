/**
 * TCK-1735 (P167.05) — `useBookings({ onlyMine: true })` envoie `filter[managed_by]=me`, la portée
 * « Mes chiffres » des réservations ; sans elle, aucun filtre de portée.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useApiQuery = vi.fn();
vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (...args: unknown[]) => useApiQuery(...args),
  useApiMutation: vi.fn(),
}));

const { useBookings } = await import('../bookings');

describe('useBookings — la portée « Mes biens » (TCK-1735)', () => {
  beforeEach(() => useApiQuery.mockReset());

  it('envoie filter[managed_by]=me', () => {
    useBookings({ status: 'pending', onlyMine: true });
    expect(useApiQuery.mock.calls[0]?.[2]).toMatchObject({ params: { filter: { status: 'pending', managed_by: 'me' } } });
  });

  it('ne l’envoie pas sans elle', () => {
    useBookings({ status: 'pending' });
    expect(useApiQuery.mock.calls[0]?.[2].params.filter).toEqual({ status: 'pending' });
  });
});
