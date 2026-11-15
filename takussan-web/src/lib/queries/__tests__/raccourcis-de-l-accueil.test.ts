import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-2495 — les sections de l'accueil lues par le serveur seul : les quartiers de la ville des
 * rangées (tuiles) et son offre (bloc propriétaire), sur deux endpoints qui existaient déjà.
 *
 * Le double est posé à la frontière du réseau (`apiFetch`), comme dans `rendu-serveur.test.tsx`.
 * « À vendre » (TCK-628) a quitté l'accueil : le test garde aussi qu'aucune recherche ne part plus.
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

const { raccourcisDeLAccueil, QUARTIERS_DE_L_ACCUEIL_MAX } = await import('../raccourcis-de-l-accueil');

beforeEach(() => {
  urls.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  reponses = {
    '/public/properties/neighborhoods': {
      data: [
        { value: 'Mermoz', count: 12 },
        { value: 'Ngor', count: 9 },
        { value: 'Vide', count: 0 },
      ],
      meta: { truncated: false },
    },
    '/public/properties/cities': {
      data: [
        { value: 'Dakar', count: 190, contracts: { rent: 127, sale: 63 } },
        { value: 'Thiès', count: 8, contracts: { rent: 4, sale: 4 } },
      ],
      meta: { truncated: false },
    },
  };
});

describe('raccourcisDeLAccueil', () => {
  it('lit les quartiers et l’offre de LA ville des rangées, et aucune recherche', async () => {
    const r = await raccourcisDeLAccueil('Dakar');

    expect(r.ville).toBe('Dakar');
    expect(r.quartiers).toEqual([
      { nom: 'Mermoz', compte: 12 },
      { nom: 'Ngor', compte: 9 },
    ]);
    expect(r.offre).toEqual({ ville: 'Dakar', location: 127, vente: 63 });
    expect(urls.some((u) => u.startsWith('/public/properties/search'))).toBe(false);
    expect(new URLSearchParams(urls.find((u) => u.includes('neighborhoods'))!.split('?')[1]).get('city')).toBe('Dakar');
  });

  it('la ville se retrouve sans tenir compte de la casse', async () => {
    expect((await raccourcisDeLAccueil('dakar')).offre?.location).toBe(127);
  });

  it(`au plus ${8} tuiles`, async () => {
    reponses['/public/properties/neighborhoods'] = {
      data: Array.from({ length: 12 }, (_, i) => ({ value: `Q${i}`, count: 20 - i })),
      meta: { truncated: false },
    };
    expect((await raccourcisDeLAccueil('Dakar')).quartiers).toHaveLength(QUARTIERS_DE_L_ACCUEIL_MAX);
  });

  it('un compte de contrat absent n’est pas zéro : pas d’offre plutôt qu’un chiffre faux', async () => {
    reponses['/public/properties/cities'] = { data: [{ value: 'Dakar', count: 190 }], meta: { truncated: false } };
    expect((await raccourcisDeLAccueil('Dakar')).offre).toBeNull();
  });

  it('en panne, chaque section disparaît seule', async () => {
    reponses['/public/properties/neighborhoods'] = new Error('API éteinte');
    const r = await raccourcisDeLAccueil('Dakar');
    expect(r.quartiers).toBeNull();
    expect(r.offre).not.toBeNull();
  });

  it('sans ville (découverte en panne), rien n’est demandé', async () => {
    const r = await raccourcisDeLAccueil(null);
    expect(r).toEqual({ ville: null, quartiers: null, offre: null });
    expect(urls).toHaveLength(0);
  });
});
