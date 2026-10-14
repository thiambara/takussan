'use client';

import { useApiQuery } from '@/hooks/useApiQuery';
import type { GeoCity, GeoNeighborhood, GeoRegion } from '@/types/geo';

/**
 * TCK-633 (lot E) — les listes publiques que le panneau de filtres de la recherche propose.
 *
 * - villes et quartiers : le référentiel géographique (ADR-0062, routes du lot D) ; la recherche
 *   filtre toujours par le NOM canonique (`city`, `location`), jamais par l'identifiant ;
 * - équipements : le catalogue APPROUVÉ, par `GET /api/public/amenities` — lisible sans compte, à
 *   la différence de `/api/tags` (addendum du plan maître, interface D → E). Liste fermée, sans
 *   `fields[]` ni `filter[]` à négocier : le contrôleur ne rend que `id`, `name`, `slug`.
 *
 * ⚠ `useApiQuery` n'ajoute PAS `/api` : chaque chemin l'écrit (`takussan-web/CLAUDE.md`).
 * Les listes bougent peu : une heure de fraîcheur, et un seul appel pour le rail ET le tiroir.
 */

export type RegionDuReferentiel = GeoRegion;
export type VilleDuReferentiel = GeoCity;
export type QuartierDuReferentiel = GeoNeighborhood;

export interface EquipementDuCatalogue {
  readonly id: number;
  readonly name: string;
  readonly slug: string;
}

export interface ListeDuReferentiel<T> {
  readonly data: readonly T[];
}

const UNE_HEURE_MS = 60 * 60 * 1000;

export const referentielPublicQueryKeys = {
  all: ['referentiel-public'] as const,
  regions: () => [...referentielPublicQueryKeys.all, 'regions'] as const,
  villes: () => [...referentielPublicQueryKeys.all, 'villes'] as const,
  quartiers: (villeId: number | null) => [...referentielPublicQueryKeys.all, 'quartiers', villeId] as const,
  equipements: () => [...referentielPublicQueryKeys.all, 'equipements'] as const,
};

/**
 * Les 14 régions — TCK-635 (ADR-0062 §8) : leur nom départage les villes homonymes, que la liste
 * des villes ne porte que par `region_id`.
 */
export function useRegionsDuReferentiel() {
  return useApiQuery<ListeDuReferentiel<RegionDuReferentiel>>(
    referentielPublicQueryKeys.regions(),
    '/api/public/geo/regions',
    { staleTime: UNE_HEURE_MS },
  );
}

/** Toutes les villes du référentiel — le panneau ne demande pas de région d'abord. */
export function useVillesDuReferentiel() {
  return useApiQuery<ListeDuReferentiel<VilleDuReferentiel>>(
    referentielPublicQueryKeys.villes(),
    '/api/public/geo/cities',
    { staleTime: UNE_HEURE_MS },
  );
}

/** Les quartiers d'une ville ; rien n'est demandé tant qu'aucune ville n'est choisie. */
export function useQuartiersDuReferentiel(villeId: number | null) {
  return useApiQuery<ListeDuReferentiel<QuartierDuReferentiel>>(
    referentielPublicQueryKeys.quartiers(villeId),
    '/api/public/geo/neighborhoods',
    {
      params: { extra: { city: villeId ?? undefined } },
      enabled: villeId !== null,
      staleTime: UNE_HEURE_MS,
    },
  );
}

/** Le catalogue approuvé des équipements, trié par nom côté serveur. */
export function useEquipementsApprouves() {
  return useApiQuery<ListeDuReferentiel<EquipementDuCatalogue>>(
    referentielPublicQueryKeys.equipements(),
    '/api/public/amenities',
    { staleTime: UNE_HEURE_MS },
  );
}
