import { vi } from 'vitest';

// Sans import de composant ni du module de requêtes : la fabrique de vi.mock() charge ce fichier
// pendant que le module visé se résout, un import circulaire figerait la collecte.
/** Les fonctions de requête que les tests de la fiche remplacent ; le reste du module reste vrai. */
export function mockRadarQueries<T extends object>(original: T) {
  return {
    ...original,
    fetchRadarListing: vi.fn(),
    fetchRadarMatches: vi.fn(),
    patchRadarListing: vi.fn(),
    reviewRadarListing: vi.fn(),
    markRadarListingDuplicate: vi.fn(),
    discardRadarListing: vi.fn(),
    setRadarListingAdvertiser: vi.fn(),
    fetchNextRadarListingId: vi.fn(),
    unmergeRadarListing: vi.fn(),
  };
}

export function mockReferentiel() {
  return {
    useVillesDuReferentiel: () => ({ data: { data: [{ id: 1, region_id: 1, name: 'Dakar', slug: 'dakar', latitude: null, longitude: null }] }, isLoading: false }),
    useQuartiersDuReferentiel: (villeId: number | null) => ({
      data: villeId === null ? undefined : {
        data: [{ id: 12, city_id: 1, name: 'Almadies', slug: 'almadies', latitude: null, longitude: null, status: 'approved' }],
      },
      isLoading: false,
    }),
  };
}
