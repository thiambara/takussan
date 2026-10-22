import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { submitBookingRequest } from '@/app/actions/property';
import { useBookingRequest } from '../useBookingRequest';

/** TCK-1406 (P144.03) — le formulaire de réservation renvoie la même clé après un échec. */
vi.mock('@/app/actions/property', () => ({ submitBookingRequest: vi.fn() }));
vi.mock('@/hooks/useTriggerMinimalProfileOnce', () => ({
  useTriggerMinimalProfileOnce: () => ({ triggerIfNeeded: () => undefined }),
}));

describe('useBookingRequest — clé d’idempotence (TCK-1406)', () => {
  it('passe la même clé à l’action d’un essai à l’autre, et une neuve après un succès', async () => {
    const action = vi.mocked(submitBookingRequest);
    action
      .mockResolvedValueOnce({ ok: false, message: 'Erreur réseau' })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });
    const { result } = renderHook(() => useBookingRequest('villa-1'));
    const payload = { start_date: '2026-11-01', end_date: '2026-11-03', guests: 2 };

    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await result.current.submit(payload).catch(() => undefined);
      });
    }

    const cles = action.mock.calls.map((appel) => appel[2]);
    expect(cles[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(cles[1]).toBe(cles[0]);
    expect(cles[2]).not.toBe(cles[0]);
  });
});
