import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const gestes = vi.hoisted(() => [] as unknown[][]);
vi.mock('@/hooks/useApiQuery', () => ({
  useApiMutation: (...args: unknown[]) => {
    gestes.push(args);
    return { mutateAsync: vi.fn(), isPending: false };
  },
}));

const { useDeposerUnePiece, useRepondreALaContreOffre } = await import('@/lib/queries/booking-gestes-du-client');

type Forme = { path: (v: unknown) => string; method: string; formData?: boolean; body?: (v: unknown) => unknown };

/**
 * TCK-2879 — les routes réellement appelées par les gestes du client : le dépôt d'une pièce (TCK-2872)
 * et la réponse à la contre-offre (TCK-2873). Les écrans mockent ce module ; ici, ce qu'il envoie.
 */
describe('gestes du client (TCK-2879)', () => {
  it('déposer : `POST /api/bookings/{id}/dossier/{piece}/document` en multipart `file`, puis relit dossier, fiche et liste', () => {
    renderHook(() => useDeposerUnePiece(7));
    const [forme, options] = gestes.at(-1) as [Forme, { invalidate: unknown[] }];
    const file = new File(['x'], 'attestation.pdf', { type: 'application/pdf' });
    expect(forme.path({ piece: 'employment_certificate', file })).toBe('/api/bookings/7/dossier/employment_certificate/document');
    expect(forme.method).toBe('POST');
    expect(forme.formData).toBe(true);
    const corps = forme.body!({ piece: 'employment_certificate', file }) as FormData;
    expect(corps.get('file')).toBe(file);
    expect([...corps.keys()]).toEqual(['file']);
    expect(options.invalidate).toEqual([['bookings', 'dossier', 7], ['bookings', 'detail', 7], ['bookings', 'list']]);
  });

  it('répondre : `…/counter-offers/{id}/accept` ou `…/decline`, sans corps', () => {
    renderHook(() => useRepondreALaContreOffre(7));
    const [forme, options] = gestes.at(-1) as [Forme, { invalidate: unknown[] }];
    expect(forme.path({ contreOffreId: 3, reponse: 'accept' })).toBe('/api/bookings/7/counter-offers/3/accept');
    expect(forme.path({ contreOffreId: 3, reponse: 'decline' })).toBe('/api/bookings/7/counter-offers/3/decline');
    expect(forme.method).toBe('POST');
    expect(forme.body!({ contreOffreId: 3, reponse: 'accept' })).toBeUndefined();
    expect(options.invalidate).toEqual([['bookings', 'detail', 7], ['bookings', 'list']]);
  });
});
