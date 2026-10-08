// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

/**
 * TCK-598, après verif-598 (m5) — **un argument de server action vient du client.** Interpolé brut,
 * le slug faisait poster le serveur Next sur n'importe quel chemin de l'hôte de l'API — par le
 * chemin INTERNE de confiance une fois `API_INTERNAL_URL` posée. Et `encodeURIComponent` seul ne
 * suffit pas : il laisse `.` et `..`, que `fetch` résout en segments de chemin (m2).
 *
 * Un slug hors de la forme d'un slug de bien est donc traité comme un bien INTROUVABLE : aucun
 * appel ne part, et l'appelant reçoit le 404 qu'un slug inconnu lui aurait valu.
 */
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton-de-test' }));

import {
  submitBookingRequest,
  submitContactLead,
  submitContactMessage,
  submitPropertyReport,
  submitPurchaseOffer,
  submitVisitRequest,
} from '../property';

const ACTIONS: readonly (readonly [string, (slug: string) => Promise<{ ok: boolean; status?: number }>])[] = [
  ['submitPropertyReport', (s) => submitPropertyReport(s, { reason: 'spam' })],
  ['submitVisitRequest', (s) => submitVisitRequest(s, { type: 'in_person', scheduled_at: '2026-11-12T10:00:00Z' })],
  ['submitBookingRequest', (s) => submitBookingRequest(s, { start_date: '2026-11-12', end_date: '2026-11-14', guests: 2 })],
  ['submitPurchaseOffer', (s) => submitPurchaseOffer(s, { offer_amount: 1, offer_expires_at: '2026-12-01', terms_accepted: true })],
  ['submitContactMessage', (s) => submitContactMessage(s, 'Bonjour')],
  ['submitContactLead', (s) => submitContactLead(s, { name: 'Awa', phone: '+221771234567', message: 'Bonjour' })],
];

let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response(JSON.stringify({ data: { conversation_id: 1, redirect_to: '/x' } }), { status: 200 }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('m5 — un slug hors forme ne fait partir AUCUN appel', () => {
  for (const [nom, action] of ACTIONS) {
    it.each(['.', '..', '../x', '../../agents', 'a/b', '', 'villa?x=1'])(`${nom}(%j) : introuvable, rien n’est parti`, async (slug) => {
      const resultat = await action(slug);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(resultat).toMatchObject({ ok: false, status: 404 });
    });
  }
});

describe('un slug de bien, lui, part tel quel sur SON chemin', () => {
  for (const [nom, action] of ACTIONS) {
    it(`${nom}('-abc123') : un seul appel, sous /api/public/properties/-abc123/`, async () => {
      // Un slug qui commence par `-` est produit par l'API pour un titre sans lettre latine (m3).
      await action('-abc123');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(new URL(String(fetchSpy.mock.calls[0]![0])).pathname).toMatch(/^\/api\/public\/properties\/-abc123\/[a-z-]+$/);
    });
  }
});
