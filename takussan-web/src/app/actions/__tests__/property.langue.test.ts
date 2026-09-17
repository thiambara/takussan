// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Vérification adverse de TCK-535 — les actions de la fiche du bien transmettent la langue de la
 * requête à l'API.
 *
 * `apiRequest` ne lisait la langue que dans le cookie du navigateur. Depuis une action serveur,
 * aucun `Accept-Language` ne partait, et Laravel répondait dans sa langue par défaut
 * (`APP_LOCALE=en`) : relevé au navigateur, une demande de réservation refusée affichait
 * « The end date field is required. » sur une fiche en français.
 *
 * Le correctif, d'abord local à ce module, vit dans `apiRequest` depuis TCK-536. Le test observe
 * donc l'en-tête réellement ENVOYÉ (`fetch` espionné, `apiRequest` réel), et non une option
 * passée : il reste juste quel que soit l'endroit où la langue est résolue. Environnement `node` :
 * sous jsdom, `window` existe et le chemin serveur n'est jamais pris.
 */
vi.mock('next-intl/server', async () => ({
  ...(await import('@/test/intl')).mockTraductionsServeur(),
  getLocale: async () => 'wo',
}));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton-de-test' }));

import { submitBookingRequest, submitPurchaseOffer, submitVisitRequest } from '../property';

describe('actions de la fiche — Accept-Language', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  const appels = (): Array<{ url: string; enTetes: Record<string, string> }> =>
    (fetchSpy.mock.calls as Array<[RequestInfo | URL, RequestInit | undefined]>).map(([url, init]) => ({
      url: String(url),
      enTetes: init?.headers as Record<string, string>,
    }));

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response('{"data":{}}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('la demande de réservation part avec la langue de la requête', async () => {
    await submitBookingRequest('bien-7', { start_date: '2026-10-01', end_date: '2026-10-04', guests: 1 });

    const [appel] = appels();
    expect(appel!.url).toContain('/api/public/properties/bien-7/booking-request');
    expect(appel!.enTetes).toMatchObject({
      'Accept-Language': 'wo',
      Authorization: 'Bearer jeton-de-test',
    });
  });

  it('l’offre d’achat et la demande de visite aussi', async () => {
    await submitPurchaseOffer('bien-7', {
      offer_amount: 1,
      offer_expires_at: '2026-10-01',
      terms_accepted: true,
    } as Parameters<typeof submitPurchaseOffer>[1]);
    await submitVisitRequest('bien-7', {} as Parameters<typeof submitVisitRequest>[1]);

    expect(appels()).toHaveLength(2);
    for (const { enTetes } of appels()) {
      expect(enTetes['Accept-Language']).toBe('wo');
    }
  });
});
