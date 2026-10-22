import { describe, expect, it, vi } from 'vitest';

import { useApiMutation } from '@/hooks/useApiQuery';
import { useCreateBookingPayment } from '../bookings';

/**
 * ADR-0072 lot 2 — les écritures de réservation qui partent sous une clé d'idempotence gardée
 * d'un essai à l'autre par `useApiMutation` (TCK-1396) : l'acompte (TCK-1400, P144.04).
 */
vi.mock('@/hooks/useApiQuery', () => ({ useApiMutation: vi.fn(), useApiQuery: vi.fn() }));

describe('réservations — clé d’idempotence', () => {
  it('l’acompte demande l’option idempotence (TCK-1400)', () => {
    vi.mocked(useApiMutation).mockClear();

    useCreateBookingPayment(7);

    expect(vi.mocked(useApiMutation)).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST' }),
      expect.objectContaining({ idempotence: true }),
    );
  });
});
