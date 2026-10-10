import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-628 — la section « À vendre » de l'accueil, lue sur la recherche publique EXISTANTE.
 *
 * Le double est posé à la frontière du réseau (`apiFetch`), comme dans `rendu-serveur.test.tsx`.
 * Les tuiles par ville, par type et par quartier ont été retirées le 2026-10-10 : le test garde
 * aussi qu'aucune de leurs requêtes ne part plus.
 */

const urls: string[] = [];
let reponses: Record<string, unknown | Error> = {};

vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiFetch: vi.fn(async (path: string) => {
      urls.push(path);
      const cle = Object.keys(reponses).find((prefixe) => path.startsWith(prefixe));
      const reponse = cle === undefined ? new Error(`non doublé : ${path}`) : reponses[cle];
      if (reponse instanceof Error) throw reponse;
      return reponse;
    }),
  };
});

const { raccourcisDeLAccueil } = await import('../raccourcis-de-l-accueil');

const BIEN = { id: 1, title: 'Villa', slug: 'villa', contract_type: 'sale' };

beforeEach(() => {
  urls.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  reponses = {
    '/public/properties/search': { data: [BIEN], facets: {}, meta: { total: 1 } },
  };
});

describe('raccourcisDeLAccueil', () => {
  it('demande la vente à la recherche publique, et rien d’autre', async () => {
    const r = await raccourcisDeLAccueil('fr');

    expect(r.vente?.map((b) => b.id)).toEqual([1]);
    expect(urls).toHaveLength(1);
    expect(new URLSearchParams(urls[0]!.split('?')[1]).get('contract_type')).toBe('sale');
  });

  it('en panne, la section disparaît', async () => {
    reponses['/public/properties/search'] = new Error('Meilisearch éteint');

    expect((await raccourcisDeLAccueil('fr')).vente).toBeNull();
  });
});
