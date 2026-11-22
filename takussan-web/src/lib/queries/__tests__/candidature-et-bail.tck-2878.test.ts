import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const gestes = vi.hoisted(() => [] as unknown[][]);

vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: () => ({ data: undefined, isLoading: false }),
  useApiMutation: (...args: unknown[]) => {
    gestes.push(args);
    return { mutateAsync: vi.fn(), isPending: false };
  },
}));

const { useAjouterUnGarant, useAnnulerLePassageDEtape, useCreerLeBailRepris, useRetirerUnGarant } = await import('@/lib/queries/candidature-et-bail');
const { useConfirmBooking, useRejectBooking } = await import('@/lib/queries/bookings');

type Forme = { path: string | ((v: never) => string); method: string };
type Options = { invalidate: unknown[]; relireSurErreur?: boolean };
const dernier = () => gestes.at(-1) as [Forme, Options];

/**
 * TCK-2878 — les routes réellement appelées par la fiche d'une candidature (les tests de la fiche
 * mockent ce module), et ce qu'elles relisent : l'acceptation et le retour d'étape relisent le fil
 * du client, sans quoi « Le fil de {prénom} » garderait l'état d'avant l'acceptation.
 */
describe('les gestes de la candidature et du bail (TCK-2878)', () => {
  it('« Annuler » le passage d’étape poste sur `…/pipeline-stage/undo` et relit réservation, fiche, fil et pipeline, même sur un refus', () => {
    renderHook(() => useAnnulerLePassageDEtape(3, 42));
    const [forme, options] = dernier();
    expect(forme).toMatchObject({ path: '/api/customers/3/pipeline-stage/undo', method: 'POST' });
    expect(options.invalidate).toEqual(expect.arrayContaining([['bookings', 'detail', 42], ['customers'], ['customer-timeline', 3], ['crm-pipeline']]));
    expect(options.relireSurErreur).toBe(true);
  });

  it('le bail repris poste sur `/api/leases` et relit la réservation (passée à `completed`)', () => {
    renderHook(() => useCreerLeBailRepris(42));
    const [forme, options] = dernier();
    expect(forme).toMatchObject({ path: '/api/leases', method: 'POST' });
    expect(options.invalidate).toEqual(expect.arrayContaining([['bookings', 'detail', 42]]));
  });

  it('les garants : `POST …/guarantors` et `DELETE …/guarantors/{id}`', () => {
    renderHook(() => useAjouterUnGarant(42));
    expect(dernier()[0]).toMatchObject({ path: '/api/bookings/42/guarantors', method: 'POST' });
    renderHook(() => useRetirerUnGarant(42));
    const [forme] = dernier();
    expect(forme.method).toBe('DELETE');
    expect((forme.path as (v: { guarantorId: number }) => string)({ guarantorId: 8 })).toBe('/api/bookings/42/guarantors/8');
  });

  it('Accepter et Refuser relisent le fil du client', () => {
    renderHook(() => useConfirmBooking(42));
    expect(dernier()[1].invalidate).toEqual(expect.arrayContaining([['customer-timeline'], ['customers']]));
    renderHook(() => useRejectBooking(42));
    expect(dernier()[1].invalidate).toEqual(expect.arrayContaining([['customer-timeline']]));
  });
});
