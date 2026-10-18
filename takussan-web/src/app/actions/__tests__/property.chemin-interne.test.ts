// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

/**
 * TCK-838 (P37.03) — les trois formulaires anonymes de la surface publique (demande de visite,
 * contact d'un bien, contact d'un agent) partent d'une ACTION SERVEUR : c'est le serveur Next qui
 * appelle l'API, et l'IP du visiteur ne survit que sur le chemin interne (`API_INTERNAL_URL`,
 * ADR-0052 § 5). Par l'URL publique, Traefik efface le `X-Forwarded-For`, et les bornes par
 * visiteur (`public-visit-request`, `public-contact-lead`) deviennent un seau pour tout le site.
 *
 * Ce que ce fichier garde : quand l'environnement déclare un chemin interne, aucune de ces trois
 * actions ne part sur l'URL publique, et chacune porte l'IP du visiteur. Il ne dit rien d'un
 * environnement qui n'a pas posé la clé : c'est au déploiement (reste de P37.03, TCK-720).
 */
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'x-forwarded-for': '203.0.113.7' })),
}));
vi.mock('@/lib/session', () => ({ getToken: async () => null }));

import { origineApi } from '@/lib/config-publique';
import { submitAgentContactLead, submitContactLead, submitVisitRequest } from '../property';

const INTERNE = 'http://api:8080';

const ACTIONS: readonly (readonly [string, () => Promise<unknown>])[] = [
  ['submitVisitRequest', () => submitVisitRequest('villa-dakar', { type: 'in_person', scheduled_at: '2026-11-12T10:00:00Z' })],
  ['submitContactLead', () => submitContactLead('villa-dakar', { name: 'Awa', phone: '+221771234567', message: 'Bonjour' })],
  ['submitAgentContactLead', () => submitAgentContactLead('awa-ndiaye', { name: 'Awa', phone: '+221771234567', message: 'Bonjour' })],
];

let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
  vi.stubEnv('API_INTERNAL_URL', `${INTERNE}/`);
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response(JSON.stringify({ data: {} }), { status: 200 }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('P37.03 — une action serveur anonyme ne part jamais sur l’URL publique quand un chemin interne est déclaré', () => {
  for (const [nom, action] of ACTIONS) {
    it(`${nom} : l’adresse interne, l’IP du visiteur, et jamais l’origine publique`, async () => {
      await action();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0]!;
      const entetes = ((init as RequestInit | undefined)?.headers ?? {}) as Record<string, string>;

      expect(String(url).startsWith(`${INTERNE}/api/public/`)).toBe(true);
      expect(String(url).startsWith(origineApi())).toBe(false);
      expect(entetes['X-Forwarded-For']).toBe('203.0.113.7');
      expect(entetes.Authorization).toBeUndefined();
    });
  }
});
