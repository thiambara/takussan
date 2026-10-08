// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

/**
 * TCK-598 (§ 11, ADR-0052 §5) — l'IP du visiteur dans les appels SERVEUR à l'API.
 *
 * Trois contrats, et chacun a coûté autre chose :
 *
 * - **AC17 — deux visiteurs, deux seaux.** `apiFetch` n'envoyait AUCUN `X-Forwarded-For` : tous les
 *   visiteurs rendus côté serveur (accueil, liste, pages agent et agence, index des profils)
 *   partageaient le seau de 90 requêtes par minute de `throttle:public-read`.
 * - **AC18 — un appel partagé ne parle pour personne.** Le domaine des villes, le sitemap et la fiche
 *   en cache ne lisent pas les en-têtes entrants (le `next/headers` simulé LÈVE s'il est appelé) et
 *   n'en transmettent aucun : une IP dans la clé du cache de données le fragmenterait par visiteur.
 * - **AC19 — l'IP ne se choisit pas.** `resolveVisitorIp()` retenait l'entrée la plus à GAUCHE de
 *   `X-Forwarded-For`, celle que le client écrit.
 */

vi.mock('next/headers', () => ({ headers: vi.fn() }));

import { headers } from 'next/headers';

import { apiFetch, apiRequest, ipDuVisiteur, sautsDeConfiance } from '../api';
import { decouverteDeLAccueil } from '../queries/public-discovery';
import { rechercherBiensPublics } from '../queries/public-search';
import { getAgent } from '../queries/public-agent';
import { getAgency } from '../queries/public-agency';
import { listerProfilsPublics, listerSlugsDeProfils } from '../queries/public-profiles';
import { villesDuCatalogue } from '../queries/facettes';
import { listerBiensDuSitemap } from '../queries/sitemap-catalogue';
import { FRAICHEUR_FICHE_SECONDES, getProperty } from '../queries/public-property';

const headersMock = vi.mocked(headers);

function requeteEntrante(xff: string | null): void {
  const h = new Headers();
  if (xff !== null) h.set('x-forwarded-for', xff);
  headersMock.mockResolvedValue(h as Awaited<ReturnType<typeof headers>>);
}

/** Le `next/headers` d'une route revalidée : y toucher est le défaut (la route deviendrait dynamique). */
function enTetesInterdits(): void {
  headersMock.mockImplementation(() => {
    throw new Error('next/headers lu par un appel PARTAGÉ');
  });
}

let fetchSpy: MockInstance<typeof fetch>;

function reponseJson(corps: unknown): Response {
  return new Response(JSON.stringify(corps), { status: 200, headers: { 'content-type': 'application/json' } });
}

/** Une réponse plausible pour CHAQUE endpoint appelé ici : la forme compte peu, l'en-tête tout. */
function repondre(url: string): Response {
  if (url.includes('/public/properties/cities')) return reponseJson({ data: [], meta: { truncated: false } });
  if (url.includes('/public/properties/sitemap')) return reponseJson({ data: [], meta: { last_page: 1 } });
  if (url.includes('/public/agents?') || url.includes('/public/agencies?')) {
    return reponseJson({ data: [], meta: { current_page: 1, last_page: 1, total: 0, cities: [] } });
  }
  return reponseJson({ data: { id: 1, slug: 'x', rows: {} } });
}

function envoyes(): { url: string; init: RequestInit; entetes: Record<string, string> }[] {
  return fetchSpy.mock.calls.map(([url, init]) => ({
    url: String(url),
    init: (init ?? {}) as RequestInit,
    entetes: ((init as RequestInit | undefined)?.headers ?? {}) as Record<string, string>,
  }));
}

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => repondre(String(url)));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  headersMock.mockReset();
  vi.unstubAllEnvs();
});

describe('ipDuVisiteur — la chaîne de confiance, jamais la gauche', () => {
  it('un saut : la dernière entrée, celle que le mandataire a écrite', () => {
    expect(ipDuVisiteur('198.51.100.9, 203.0.113.5', 1)).toBe('203.0.113.5');
  });

  it('deux sauts (Cloudflare puis Traefik) : l’avant-dernière', () => {
    expect(ipDuVisiteur('198.51.100.9, 203.0.113.5, 172.70.1.1', 2)).toBe('203.0.113.5');
  });

  it('une chaîne plus courte que les sauts : la seule entrée, qui est alors la vraie', () => {
    expect(ipDuVisiteur('203.0.113.7', 2)).toBe('203.0.113.7');
  });

  it('rien à lire : rien à transmettre', () => {
    expect(ipDuVisiteur(null, 1)).toBeUndefined();
    expect(ipDuVisiteur(' , ', 1)).toBeUndefined();
  });

  it('`VISITOR_IP_TRUSTED_HOPS` illisible ou nul retombe sur 1', () => {
    for (const brut of ['', 'abc', '0', '-3']) {
      vi.stubEnv('VISITOR_IP_TRUSTED_HOPS', brut);
      expect(sautsDeConfiance()).toBe(1);
    }
    vi.stubEnv('VISITOR_IP_TRUSTED_HOPS', '2');
    expect(sautsDeConfiance()).toBe(2);
  });
});

describe('AC19 — une IP forgée à gauche ne passe ni par apiFetch ni par apiRequest', () => {
  it('`198.51.100.9, 203.0.113.5` avec un saut : 203.0.113.5, des deux côtés', async () => {
    requeteEntrante('198.51.100.9, 203.0.113.5');

    await apiFetch('/public/test', undefined, { locale: 'fr' });
    await apiRequest('/api/test');

    const [parFetch, parRequest] = envoyes();
    expect(parFetch!.entetes['X-Forwarded-For']).toBe('203.0.113.5');
    expect(parRequest!.entetes['X-Forwarded-For']).toBe('203.0.113.5');
  });

  it('la configuration de preview (deux sauts) retient l’entrée de Cloudflare', async () => {
    vi.stubEnv('VISITOR_IP_TRUSTED_HOPS', '2');
    requeteEntrante('198.51.100.9, 203.0.113.5, 172.70.1.1');

    await apiFetch('/public/test', undefined, { locale: 'fr' });

    expect(envoyes()[0]!.entetes['X-Forwarded-For']).toBe('203.0.113.5');
  });
});

describe('AC17 — chaque appel rendu POUR le visiteur porte SON IP', () => {
  const appels: readonly (readonly [string, (n: number) => Promise<unknown>])[] = [
    ['accueil', (n) => decouverteDeLAccueil('fr', `Ville-${n}`)],
    ['liste', (n) => rechercherBiensPublics(`page=${n}`, 'fr')],
    ['page agent', (n) => getAgent(`agent-${n}`, 'fr')],
    ['page agence', (n) => getAgency(`agence-${n}`, 'fr')],
    ['index des profils', (n) => listerProfilsPublics('agents', { page: n }, 'fr')],
  ];

  for (const [nom, appelle] of appels) {
    it(`${nom} : 203.0.113.1 puis 203.0.113.2`, async () => {
      requeteEntrante('203.0.113.1');
      await appelle(1);
      requeteEntrante('203.0.113.2');
      await appelle(2);

      expect(envoyes().map((e) => e.entetes['X-Forwarded-For'])).toEqual(['203.0.113.1', '203.0.113.2']);
    });
  }
});

describe('AC18 — un appel PARTAGÉ ne lit pas les en-têtes entrants et n’en transmet aucun', () => {
  const partages: readonly (readonly [string, () => Promise<unknown>])[] = [
    ['domaine des villes', () => villesDuCatalogue()],
    ['sitemap du catalogue', () => listerBiensDuSitemap()],
    ['pagination des profils pour le sitemap', () => listerSlugsDeProfils('agents')],
    ['fiche en cache', () => getProperty('fiche-partagee', 'fr')],
  ];

  for (const [nom, appelle] of partages) {
    it(nom, async () => {
      enTetesInterdits();

      await appelle();

      expect(headersMock).not.toHaveBeenCalled();
      expect(envoyes().length).toBeGreaterThan(0);
      for (const { entetes } of envoyes()) {
        expect(entetes['X-Forwarded-For']).toBeUndefined();
        expect(entetes.Authorization).toBeUndefined();
      }
    });
  }

  it('l’index des profils rendu pour un visiteur, lui, n’est PAS partagé', async () => {
    requeteEntrante('203.0.113.9');

    await listerProfilsPublics('agencies', { page: 3 }, 'fr');

    expect(envoyes()[0]!.entetes['X-Forwarded-For']).toBe('203.0.113.9');
  });
});

describe('AC7 — la fiche se lit dans le cache de données, étiquetée par slug', () => {
  it('revalidate 300 s, étiquette `property:{slug}`, et rien de propre au visiteur dans la clé', async () => {
    enTetesInterdits();

    await getProperty('studio-a-mermoz-abc123', 'en');

    const [{ url, init, entetes }] = envoyes();
    expect(url).toMatch(/\/api\/public\/properties\/studio-a-mermoz-abc123$/);
    expect((init as RequestInit & { next?: unknown }).next).toEqual({
      revalidate: FRAICHEUR_FICHE_SECONDES,
      tags: ['property:studio-a-mermoz-abc123'],
    });
    expect(FRAICHEUR_FICHE_SECONDES).toBe(300);
    // Seule la langue varie, et elle le doit : les libellés d'énumération sont traduits par l'API.
    expect(Object.keys(entetes).sort()).toEqual(['Accept', 'Accept-Language']);
  });
});

describe('ADR-0052 §5 — le serveur joint l’API par son adresse interne', () => {
  it('avec `API_INTERNAL_URL` : la base interne, et l’hôte public en X-Forwarded-*, identiques pour tous', async () => {
    vi.stubEnv('API_INTERNAL_URL', 'http://api:8080/');
    requeteEntrante('203.0.113.1');

    await apiFetch('/public/test', undefined, { locale: 'fr', partage: true });
    await apiRequest('/api/test');

    const [parFetch, parRequest] = envoyes();
    expect(parFetch!.url).toBe('http://api:8080/api/public/test');
    expect(parRequest!.url).toBe('http://api:8080/api/test');
    for (const { entetes } of [parFetch!, parRequest!]) {
      expect(entetes['X-Forwarded-Host']).toBe(new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8002').hostname);
      expect(entetes['X-Forwarded-Proto']).toMatch(/^https?$/);
      expect(entetes['X-Forwarded-Port']).toMatch(/^\d+$/);
    }
    // Partagé : toujours aucune IP, même sur le chemin interne.
    expect(parFetch!.entetes['X-Forwarded-For']).toBeUndefined();
  });

  it('sans `API_INTERNAL_URL` : l’URL publique, et aucun X-Forwarded-Host', async () => {
    vi.stubEnv('API_INTERNAL_URL', '');
    requeteEntrante(null);

    await apiFetch('/public/test', undefined, { locale: 'fr' });

    const [{ url, entetes }] = envoyes();
    expect(url.startsWith('http://api:8080')).toBe(false);
    expect(entetes['X-Forwarded-Host']).toBeUndefined();
  });
});
