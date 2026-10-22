// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-1406 (P144.03, ADR-0072 lot 3) — l'action serveur transmet TELLE QUELLE la clé reçue du
 * composant client, d'un essai à l'autre, et n'en engendre aucune elle-même. `fetch` espionné,
 * `apiRequest` réel : on observe l'en-tête réellement envoyé.
 */
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton-de-test' }));

import { submitBookingRequest, submitContactMessage, submitPurchaseOffer } from '../property';

describe('actions de réservation — Idempotency-Key (TCK-1406)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  const cles = (): Array<string | undefined> =>
    (fetchSpy.mock.calls as Array<[RequestInfo | URL, RequestInit | undefined]>).map(
      ([, init]) => (init?.headers as Record<string, string>)['Idempotency-Key'],
    );

  beforeEach(() => {
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(
        async () => new Response('{"message":"x"}', { status: 502, headers: { 'content-type': 'application/json' } }),
      )
      .mockImplementation(
        async () => new Response('{"data":{}}', { status: 201, headers: { 'content-type': 'application/json' } }),
      );
  });
  afterEach(() => fetchSpy.mockRestore());

  it('la demande de réservation envoie la même clé reçue, au premier essai et au second', async () => {
    const payload = { start_date: '2026-11-01', end_date: '2026-11-03', guests: 2 };

    expect((await submitBookingRequest('villa-1', payload, 'cle-du-composant-1')).ok).toBe(false);
    expect((await submitBookingRequest('villa-1', payload, 'cle-du-composant-1')).ok).toBe(true);

    expect(cles()).toEqual(['cle-du-composant-1', 'cle-du-composant-1']);
  });

  it('l’offre d’achat envoie la clé reçue, et aucune sans clé', async () => {
    const payload = { offer_amount: 1, offer_expires_at: '2026-12-01', terms_accepted: true };

    await submitPurchaseOffer('villa-1', payload, 'cle-du-composant-2');
    await submitPurchaseOffer('villa-1', payload);

    expect(cles()).toEqual(['cle-du-composant-2', undefined]);
  });

  it('TCK-1408 — le message de la fiche envoie la même clé reçue, d’un essai à l’autre', async () => {
    await submitContactMessage('villa-1', 'Bonjour', 'cle-du-composant-3');
    await submitContactMessage('villa-1', 'Bonjour', 'cle-du-composant-3');

    expect(cles()).toEqual(['cle-du-composant-3', 'cle-du-composant-3']);
  });
});
