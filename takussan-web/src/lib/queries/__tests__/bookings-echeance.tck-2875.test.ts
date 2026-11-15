import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const appels = vi.hoisted(() => [] as unknown[][]);

vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (...args: unknown[]) => {
    appels.push(args);
    return { data: undefined, isLoading: false };
  },
  useApiMutation: vi.fn(),
}));

const { useBookings } = await import('@/lib/queries/bookings');

/**
 * TCK-2875 — « Expire demain » lit `response_deadline`, que l'API ne calcule que si la lecture porte
 * TOUTES les colonnes de `BookingResource::CHAMPS_DE_L_ECHEANCE` ; sous un sparse fieldset qui en omet
 * une, la clé vaut `null` et l'alerte ne paraîtrait jamais dans la vraie liste.
 */
describe('la liste des réservations demande les colonnes de l’échéance (TCK-2875)', () => {
  it('status, agency_id, created_at, expires_at, expired_at partent avec `fields[bookings]`', () => {
    renderHook(() => useBookings({ kind: 'application', status: 'pending', avecClient: true }));
    const [, chemin, options] = appels.at(-1) as [unknown, string, { params: { fields: { bookings: readonly string[] } } }];
    expect(chemin).toBe('/api/bookings');
    expect(options.params.fields.bookings).toEqual(expect.arrayContaining(['status', 'agency_id', 'created_at', 'expires_at', 'expired_at']));
  });
});
