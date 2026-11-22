import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SearchResult } from '@/types/search';

const rechercher = vi.fn<(requete: string, locale: string) => Promise<SearchResult | null>>();
vi.mock('@/lib/queries/public-search', () => ({
  rechercherBiensPublics: (requete: string, locale: string) => rechercher(requete, locale),
}));

import { chargerPortefeuilleDeFiche } from '@/lib/queries/portefeuille-de-fiche';

function resultat(total: number): SearchResult {
  return { data: [], meta: { total, current_page: 1, last_page: 1, per_page: 12 } } as unknown as SearchResult;
}

/**
 * TCK-2522 · AC1 — `/fr/agencies/<slug>?contract_type=rent&bedrooms=2&price_max=1000000` rend côté
 * SERVEUR les biens filtrés et « N biens sur M ». La page passe ses `searchParams` à ce chargeur ;
 * ces tests gardent les deux requêtes qu'il construit.
 */
describe('chargerPortefeuilleDeFiche', () => {
  beforeEach(() => {
    rechercher.mockReset();
  });

  it('AC1 — la première page porte les filtres de l’URL ET le périmètre ; le total, le périmètre seul', async () => {
    rechercher.mockImplementation(async (requete) => (requete.includes('per_page=1&') || requete.endsWith('per_page=1') ? resultat(68) : resultat(7)));

    const p = await chargerPortefeuilleDeFiche(
      { agency: 'dakar-immo' },
      { contract_type: 'rent', bedrooms: '2', price_max: '1000000' },
      'fr',
    );

    expect(rechercher).toHaveBeenCalledTimes(2);
    const [filtree, ensemble] = rechercher.mock.calls.map(([requete]) => new URLSearchParams(requete));

    expect(Object.fromEntries(filtree)).toMatchObject({
      agency: 'dakar-immo',
      contract_type: 'rent',
      bedrooms: '2',
      price_max: '1000000',
      placements: 'false',
      facets: 'contract_type,type,bedrooms,neighborhood',
      per_page: '12',
    });
    // Le « sur M » : AUCUN filtre de l'URL — sans quoi M vaudrait N.
    expect(ensemble.get('agency')).toBe('dakar-immo');
    expect(ensemble.get('per_page')).toBe('1');
    expect(ensemble.has('contract_type')).toBe(false);
    expect(ensemble.has('bedrooms')).toBe(false);
    expect(ensemble.has('price_max')).toBe(false);

    expect(p.total).toBe(68);
    expect(p.graine?.resultat.meta.total).toBe(7);
    // La clef de la graine est celle que le navigateur recalculera : la page n'est pas redemandée.
    expect(p.graine?.clef).toBe(rechercher.mock.calls[0][0]);
    expect(rechercher.mock.calls.every(([, locale]) => locale === 'fr')).toBe(true);
  });

  it('un périmètre écrit dans l’URL ne sort pas de la fiche : le fixe l’emporte', async () => {
    rechercher.mockResolvedValue(resultat(3));

    await chargerPortefeuilleDeFiche({ agency: 'dakar-immo' }, { agency: 'autre-agence', placements: 'true' }, 'fr');

    for (const [requete] of rechercher.mock.calls) {
      const params = new URLSearchParams(requete);
      expect(params.getAll('agency')).toEqual(['dakar-immo']);
      expect(params.getAll('placements')).toEqual(['false']);
    }
  });

  it('une panne ne fabrique ni graine ni « sur M »', async () => {
    rechercher.mockResolvedValue(null);

    const p = await chargerPortefeuilleDeFiche({ agent: 'awa-diop' }, {}, 'fr');

    expect(p.graine).toBeNull();
    expect(p.total).toBeNull();
    expect(p.fixes.agent).toBe('awa-diop');
  });
});
