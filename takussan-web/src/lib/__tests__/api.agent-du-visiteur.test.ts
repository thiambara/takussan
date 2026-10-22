// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

/**
 * TCK-792 (P18.04, décision du porteur) — l'API ne compte aucune impression sponsorisée quand
 * l'agent est reconnu comme robot. Le rendu serveur de l'accueil et de `/properties` appelle l'API
 * depuis Next : sans l'agent du VISITEUR, l'API ne voit que celui du serveur, et un robot qui
 * parcourt le site compte ses impressions comme un visiteur.
 */

vi.mock('next/headers', () => ({ headers: vi.fn() }));

import { headers } from 'next/headers';

import { apiRequest, enTetesServeurAmont } from '../api';
import { decouverteDeLAccueil } from '../queries/public-discovery';
import { rechercherBiensPublics } from '../queries/public-search';
import { villesDuCatalogue } from '../queries/facettes';

const headersMock = vi.mocked(headers);
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

let fetchSpy: MockInstance<typeof fetch>;

function requeteEntrante(agent: string | null): void {
  const h = new Headers({ 'x-forwarded-for': '203.0.113.1' });
  if (agent !== null) h.set('user-agent', agent);
  headersMock.mockResolvedValue(h as Awaited<ReturnType<typeof headers>>);
}

function entetesEnvoyes(): Record<string, string>[] {
  return fetchSpy.mock.calls.map(([, init]) => ((init as RequestInit | undefined)?.headers ?? {}) as Record<string, string>);
}

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
    new Response(
      JSON.stringify(String(url).includes('/cities') ? { data: [], meta: { truncated: false } } : { data: { rows: {} } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  headersMock.mockReset();
});

describe('le rendu serveur transmet l’agent du visiteur à l’API', () => {
  it('la recherche publique', async () => {
    requeteEntrante(GOOGLEBOT);
    await rechercherBiensPublics('agent=1', 'fr');
    expect(entetesEnvoyes()[0]!['User-Agent']).toBe(GOOGLEBOT);
  });

  it('l’accueil', async () => {
    requeteEntrante(GOOGLEBOT);
    await decouverteDeLAccueil('fr', 'Agent-1');
    expect(entetesEnvoyes()[0]!['User-Agent']).toBe(GOOGLEBOT);
  });

  it('sans agent entrant, aucun n’est inventé', async () => {
    requeteEntrante(null);
    await rechercherBiensPublics('agent=2', 'fr');
    expect(entetesEnvoyes()[0]!['User-Agent']).toBeUndefined();
  });

  it('un appel partagé ne lit pas les en-têtes entrants et ne transmet aucun agent', async () => {
    headersMock.mockImplementation(() => {
      throw new Error('next/headers lu par un appel PARTAGÉ');
    });
    await villesDuCatalogue();
    expect(headersMock).not.toHaveBeenCalled();
    expect(entetesEnvoyes()[0]!['User-Agent']).toBeUndefined();
  });
});

/**
 * P108.01 — `apiRequest` côté serveur (les actions `'use server'`, dont les deux formulaires de
 * contact du site public) et `enTetesServeurAmont` (les relais BFF) relaient l'agent du visiteur
 * comme `apiFetch`. Sans lui, le `fetch` de Node pose `user-agent: node`, et l'API écrit `node`
 * dans le `user_agent` de chaque demande de contact.
 */
describe('les appels serveur hors apiFetch transmettent l’agent du visiteur', () => {
  const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0';

  it('apiRequest côté serveur (demande de contact par action serveur)', async () => {
    requeteEntrante(FIREFOX);
    await apiRequest('/api/public/properties/villa/contact-lead', { method: 'POST', body: { name: 'Awa' } });
    expect(entetesEnvoyes()[0]!['User-Agent']).toBe(FIREFOX);
  });

  it('apiRequest sans agent entrant n’en invente aucun', async () => {
    requeteEntrante(null);
    await apiRequest('/api/public/properties/villa/contact-lead', { method: 'POST', body: { name: 'Awa' } });
    expect(entetesEnvoyes()[0]!['User-Agent']).toBeUndefined();
  });

  it('un User-Agent passé par l’appelant n’est pas écrasé', async () => {
    requeteEntrante(FIREFOX);
    await apiRequest('/api/x', { headers: { 'User-Agent': 'appelant' } });
    expect(entetesEnvoyes()[0]!['User-Agent']).toBe('appelant');
  });

  it('enTetesServeurAmont (relais BFF) porte l’agent du visiteur', async () => {
    requeteEntrante(FIREFOX);
    expect((await enTetesServeurAmont())['User-Agent']).toBe(FIREFOX);
  });

  it('enTetesServeurAmont partagé ne lit pas les en-têtes entrants et ne porte aucun agent', async () => {
    headersMock.mockImplementation(() => {
      throw new Error('next/headers lu par un appel PARTAGÉ');
    });
    const enTetes = await enTetesServeurAmont({ partage: true });
    expect(headersMock).not.toHaveBeenCalled();
    expect(enTetes['User-Agent']).toBeUndefined();
  });
});
