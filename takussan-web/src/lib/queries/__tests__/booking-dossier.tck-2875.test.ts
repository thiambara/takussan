import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const lectures = vi.hoisted(() => [] as unknown[][]);
const gestes = vi.hoisted(() => [] as unknown[][]);

vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (...args: unknown[]) => {
    lectures.push(args);
    return { data: undefined, isLoading: false };
  },
  useApiMutation: (...args: unknown[]) => {
    gestes.push(args);
    return { mutateAsync: vi.fn(), isPending: false };
  },
}));

const { useAutresCandidaturesDuBien, useDemanderUnePiece, useDossierDeLaReservation, useVisitesDuClient } = await import('@/lib/queries/booking-dossier');

type Options = { params?: { fields?: Record<string, readonly string[]>; filter?: Record<string, unknown>; per_page?: number; include?: readonly string[] } };

/**
 * TCK-2875 — les routes que la fiche d'une candidature appelle : le dossier (TCK-2872), « Demander »
 * une pièce, « Comparer » filtré par bien, nature et statut, et le fil du client réduit aux notes et
 * aux visites. Les tests de la fiche mockent ce module : ici, ce qu'il envoie réellement.
 */
describe('les lectures et le geste du dossier (TCK-2875)', () => {
  it('le dossier se lit sur `GET /api/bookings/{id}/dossier`', () => {
    renderHook(() => useDossierDeLaReservation(42));
    expect(lectures.at(-1)![1]).toBe('/api/bookings/42/dossier');
  });

  it('« Demander » poste sur `…/dossier/{piece}/request`, relit le dossier et la fiche, même sur un refus', () => {
    renderHook(() => useDemanderUnePiece(42));
    const [forme, options] = gestes.at(-1) as [{ path: (v: { piece: string }) => string; method: string }, { invalidate: unknown[]; relireSurErreur: boolean }];
    expect(forme.method).toBe('POST');
    expect(forme.path({ piece: 'guarantor_commitment' })).toBe('/api/bookings/42/dossier/guarantor_commitment/request');
    expect(options.invalidate).toEqual([['bookings', 'dossier', 42], ['bookings', 'detail', 42]]);
    expect(options.relireSurErreur).toBe(true);
  });

  it('« Comparer » lit les candidatures EN ATTENTE du bien, client inclus, deux lignes', () => {
    renderHook(() => useAutresCandidaturesDuBien(9));
    const [, chemin, options] = lectures.at(-1) as [unknown, string, Options];
    expect(chemin).toBe('/api/bookings');
    expect(options.params?.filter).toEqual({ property_id: 9, kind: 'application', status: 'pending' });
    expect(options.params?.per_page).toBe(2);
    expect(options.params?.include).toEqual(['customer']);
    expect(options.params?.fields?.bookings).toEqual(expect.arrayContaining(['id', 'customer_id', 'agency_id']));
  });

  it('le fil du client se lit réduit aux notes et aux visites, une page de 100', () => {
    renderHook(() => useVisitesDuClient(3));
    const [, chemin, options] = lectures.at(-1) as [unknown, string, Options];
    expect(chemin).toBe('/api/customers/3/timeline');
    expect(options.params?.filter).toEqual({ type: 'note,visit' });
    expect(options.params?.per_page).toBe(100);
  });
});
