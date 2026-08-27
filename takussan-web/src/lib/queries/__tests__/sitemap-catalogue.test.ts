import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PAGES_MAX_SITEMAP,
  TAILLE_DE_PAGE_SITEMAP,
  listerBiensDuSitemap,
} from '../sitemap-catalogue';

/**
 * TCK-431 — l'énumération du catalogue **traverse toutes les pages, et LÈVE plutôt que de mentir.**
 *
 * Le mode de défaillance visé n'est pas l'erreur : c'est le tableau vide. Un `catch { return [] }`
 * ici rendrait « API en panne » et « catalogue vide » identiques, et le sitemap serait valide,
 * court, et muet sur les 840 fiches qu'il vient de perdre. C'est l'appelant qui décide de
 * dégrader, et il le journalise (`src/app/sitemap.ts`).
 */

function reponse(page: number, dernierePage: number, slugs: readonly string[]) {
  return {
    data: slugs.map((slug) => ({ slug, updated_at: '2026-08-25T09:12:00+00:00' })),
    meta: {
      total: slugs.length * dernierePage,
      per_page: TAILLE_DE_PAGE_SITEMAP,
      current_page: page,
      last_page: dernierePage,
    },
  };
}

const appels: string[] = [];

function servir(parPage: Record<number, ReturnType<typeof reponse>>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      appels.push(url);
      const page = Number(new URL(url).searchParams.get('page'));
      return { ok: true, json: async () => parPage[page] } as unknown as Response;
    }),
  );
}

describe('listerBiensDuSitemap', () => {
  beforeEach(() => {
    appels.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rend les fiches d’une page unique', async () => {
    servir({ 1: reponse(1, 1, ['a', 'b']) });

    await expect(listerBiensDuSitemap()).resolves.toEqual([
      { slug: 'a', updated_at: '2026-08-25T09:12:00+00:00' },
      { slug: 'b', updated_at: '2026-08-25T09:12:00+00:00' },
    ]);
  });

  it('traverse TOUTES les pages — une seule laisserait le catalogue tronqué en silence', async () => {
    servir({
      1: reponse(1, 3, ['a']),
      2: reponse(2, 3, ['b']),
      3: reponse(3, 3, ['c']),
    });

    const biens = await listerBiensDuSitemap();

    expect(biens.map((b) => b.slug)).toEqual(['a', 'b', 'c']);
    expect(appels).toHaveLength(3);
  });

  it('demande le plafond du serveur, pas le défaut de 20 de `index()`', async () => {
    servir({ 1: reponse(1, 1, ['a']) });

    await listerBiensDuSitemap();

    expect(appels[0]).toContain(`per_page=${TAILLE_DE_PAGE_SITEMAP}`);
    expect(appels[0]).toContain('/public/properties/sitemap');
  });

  it('LÈVE quand l’API répond en erreur, au lieu de rendre un catalogue vide', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }) as unknown as Response),
    );

    await expect(listerBiensDuSitemap()).rejects.toThrow();
  });

  it('LÈVE sur un `last_page` absurde plutôt que de boucler', async () => {
    servir({ 1: reponse(1, PAGES_MAX_SITEMAP + 1, ['a']) });

    await expect(listerBiensDuSitemap()).rejects.toThrow(new RegExp(String(PAGES_MAX_SITEMAP)));
    // Une page demandée, puis l'arrêt : le garde-fou coupe, il ne compte pas jusqu'au bout.
    expect(appels).toHaveLength(1);
  });

  it('le garde-fou est AU-DESSUS de la limite du protocole, donc il ne double pas l’autre message', () => {
    // 64 × 1000 fiches = 192 000 URL : `construireSitemap` aurait déjà refusé à 50 000, avec le
    // message qui parle de découpage. Celui-ci ne peut se déclencher que sur une API incohérente.
    expect(PAGES_MAX_SITEMAP * TAILLE_DE_PAGE_SITEMAP).toBeGreaterThan(50_000);
  });
});
