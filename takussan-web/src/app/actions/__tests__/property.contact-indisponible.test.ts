// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-590 — décision de la session après la vérification adverse (m3) : quand personne ne lirait
 * la demande, l'API rend 409 `lead.contact_unavailable` AVANT d'écrire. Le visiteur l'apprend dans sa
 * langue — jamais « Demande envoyée », jamais la prose anglaise du serveur.
 */
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/session', () => ({ getToken: async () => null }));

import { submitAgentContactLead, submitContactLead, submitVisitRequest } from '../property';

describe('dépôt public refusé faute de destinataire', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify({ code: 'lead.contact_unavailable', message: 'No one can receive this request.' }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('la demande de contact et la demande de visite disent honnêtement que rien n’est parti', async () => {
    const attendu = {
      ok: false,
      status: 409,
      message: 'Personne ne peut recevoir de demande pour ce bien en ce moment : la vôtre n’a pas été envoyée. Réessayez plus tard.',
    };

    expect(await submitContactLead('bien-7', { name: 'Awa', phone: '+221771234567', message: 'Bonjour' })).toEqual(attendu);
    expect(await submitAgentContactLead('awa', { name: 'Awa', phone: '+221771234567', message: 'Bonjour' })).toEqual(attendu);
    expect(
      await submitVisitRequest('bien-7', {
        type: 'in_person',
        scheduled_at: '2026-11-12T10:00:00Z',
        visitor_name: 'Awa',
        visitor_phone: '+221771234567',
      }),
    ).toEqual(attendu);
  });
});
