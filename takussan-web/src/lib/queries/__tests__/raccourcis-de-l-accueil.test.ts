import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-628 — les sections de raccourcis de l'accueil, lues sur des endpoints EXISTANTS.
 *
 * Le double est posé à la frontière du réseau (`apiFetch`), comme dans `rendu-serveur.test.tsx` :
 * ce qui est éprouvé, c'est la lecture des réponses — tri, seuils, garde des types inconnus — et
 * l'indépendance des sections en cas de panne.
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
    '/public/properties/cities': {
      data: [
        { value: 'Thiès', count: 4 },
        { value: 'Dakar', count: 40 },
        { value: '', count: 9 },
        { value: 'Saly', count: 0 },
      ],
      meta: { truncated: false },
    },
    '/public/property-types': {
      data: [
        { value: 'villa', count: 3 },
        { value: 'apartment', count: 12 },
        { value: 'castle', count: 99 },
        { value: 'farm', count: 0 },
      ],
    },
    '/public/properties/neighborhoods': {
      data: [
        { value: 'Mermoz', count: 8 },
        { value: 'Ngor', count: 2 },
        { value: 'Almadies', count: 11 },
      ],
      meta: { truncated: false },
    },
  };
});

describe('raccourcisDeLAccueil', () => {
  it('lit les quatre sections et les trie du plus fourni au moins fourni', async () => {
    const r = await raccourcisDeLAccueil('fr');

    expect(r.vente?.map((b) => b.id)).toEqual([1]);
    // Ville vide et ville sans bien écartées.
    expect(r.villes).toEqual([
      { valeur: 'Dakar', compte: 40 },
      { valeur: 'Thiès', compte: 4 },
    ]);
    // Un type inconnu du front n'a pas de tuile (il s'afficherait en clé brute) ; un type à 0 non plus.
    expect(r.types?.map((t) => t.valeur)).toEqual(['apartment', 'villa']);
    // Les quartiers de la ville la plus fournie, sous le seuil d'indexation (3) écartés.
    expect(r.quartiers).toEqual({
      ville: 'Dakar',
      items: [
        { valeur: 'Almadies', compte: 11 },
        { valeur: 'Mermoz', compte: 8 },
      ],
    });
  });

  it('demande la vente à la recherche publique, et les quartiers de la ville en tête', async () => {
    await raccourcisDeLAccueil('fr');

    const vente = urls.find((u) => u.startsWith('/public/properties/search'))!;
    expect(new URLSearchParams(vente.split('?')[1]).get('contract_type')).toBe('sale');
    expect(urls).toContain('/public/properties/neighborhoods?city=Dakar');
  });

  it('une section en panne disparaît SEULE', async () => {
    reponses['/public/property-types'] = new Error('API éteinte');
    reponses['/public/properties/search'] = new Error('Meilisearch éteint');

    const r = await raccourcisDeLAccueil('fr');

    expect(r.types).toBeNull();
    expect(r.vente).toBeNull();
    expect(r.villes).not.toBeNull();
    expect(r.quartiers).not.toBeNull();
  });

  it('sans villes, pas de quartiers — et aucune requête pour eux', async () => {
    reponses['/public/properties/cities'] = { data: 'pas un tableau' };

    const r = await raccourcisDeLAccueil('fr');

    expect(r.villes).toBeNull();
    expect(r.quartiers).toBeNull();
    expect(urls.some((u) => u.startsWith('/public/properties/neighborhoods'))).toBe(false);
  });
});
