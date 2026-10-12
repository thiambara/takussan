'use client';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import type { GeoCity, GeoNeighborhood, GeoRegion, ResolutionDeLien } from '@/types/geo';

const UNE_HEURE = 60 * 60 * 1000;
const CINQ_MINUTES = 5 * 60 * 1000;

interface Enveloppe<T> {
  readonly data: T;
}

const AUCUNE_REGION: readonly GeoRegion[] = [];
const AUCUNE_VILLE: readonly GeoCity[] = [];
const AUCUN_QUARTIER: readonly GeoNeighborhood[] = [];

export interface ReferentielGeo {
  readonly regions: readonly GeoRegion[];
  /** Les villes de la région choisie, ou toutes tant qu'aucune région ne l'est. */
  readonly villes: readonly GeoCity[];
  /** Les quartiers de la ville choisie — dont les propositions de l'utilisateur courant. */
  readonly quartiers: readonly GeoNeighborhood[];
  readonly chargement: { readonly villes: boolean; readonly quartiers: boolean };
}

/**
 * TCK-633 (AC9) — les trois listes du lieu.
 *
 * ⚠ Des tableaux CONSTANTS quand rien n'est chargé, jamais un `[]` neuf à chaque rendu : les
 * effets de rapprochement de `ChampsLieu` en dépendent et se rejoueraient à chaque rendu.
 *
 * ⚠ `?region=` et `?city=` ne sont pas des filtres spatie (E-14) : les endpoints publics du
 * référentiel sont des listes fermées, sans `fields[]` ni `include=` à négocier.
 */
export function useReferentielGeo(regionId: number | null, villeId: number | null): ReferentielGeo {
  const regions = useApiQuery<Enveloppe<GeoRegion[]>>(['geo', 'regions'], '/api/public/geo/regions', {
    staleTime: UNE_HEURE,
  });
  const villes = useApiQuery<Enveloppe<GeoCity[]>>(
    ['geo', 'cities', regionId],
    regionId === null ? '/api/public/geo/cities' : `/api/public/geo/cities?region=${regionId}`,
    { staleTime: UNE_HEURE },
  );
  const quartiers = useApiQuery<Enveloppe<GeoNeighborhood[]>>(
    ['geo', 'neighborhoods', villeId],
    `/api/public/geo/neighborhoods?city=${villeId ?? 0}`,
    { enabled: villeId !== null, staleTime: CINQ_MINUTES },
  );

  return {
    regions: regions.data?.data ?? AUCUNE_REGION,
    villes: villes.data?.data ?? AUCUNE_VILLE,
    quartiers: villeId === null ? AUCUN_QUARTIER : (quartiers.data?.data ?? AUCUN_QUARTIER),
    chargement: { villes: villes.isLoading, quartiers: villeId !== null && quartiers.isLoading },
  };
}

/** TCK-633 (AC9) — un lien court (`maps.app.goo.gl`, `goo.gl/maps`) se suit côté serveur. */
export function useResolutionDeLien() {
  return useApiMutation<Enveloppe<ResolutionDeLien>, { url: string }>({
    path: '/api/geo/resolve-link',
    method: 'POST',
  });
}
