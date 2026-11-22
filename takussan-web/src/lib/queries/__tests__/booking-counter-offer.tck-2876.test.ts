import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const gestes = vi.hoisted(() => [] as unknown[][]);
vi.mock('@/hooks/useApiQuery', () => ({
  useApiMutation: (...args: unknown[]) => {
    gestes.push(args);
    return { mutateAsync: vi.fn(), isPending: false };
  },
}));

const { useContreProposer } = await import('@/lib/queries/booking-counter-offer');

/**
 * TCK-2876 — la route que « Contre-proposer » appelle (TCK-2873) : la fiche mocke ce module, ici ce
 * qu'il envoie. Sans `body`, `useApiMutation` poste la saisie telle quelle (`{ amount, message?, valid_until }`).
 */
describe('« Contre-proposer » (TCK-2876)', () => {
  it('poste sur `POST /api/bookings/{id}/counter-offers` la saisie telle quelle, et relit la fiche et la liste', () => {
    renderHook(() => useContreProposer(7));
    const [forme, options] = gestes.at(-1) as [{ path: string; method: string; body?: unknown }, { invalidate: unknown[]; relireSurErreur: boolean }];
    expect(forme).toEqual({ path: '/api/bookings/7/counter-offers', method: 'POST' });
    expect(options.invalidate).toEqual([['bookings', 'detail', 7], ['bookings', 'list']]);
    expect(options.relireSurErreur).toBe(true);
  });
});
