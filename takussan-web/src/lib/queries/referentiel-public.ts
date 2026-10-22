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
 *
 * TCK-1088 (P69.06) — `actif` : faux tant que le panneau n'est pas visible (rail sous `lg`,
 * tiroir fermé). Rien n'est alors demandé.
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

export const UNE_HEURE_MS = 60 * 60 * 1000;

export const referentielPublicQueryKeys = {
  all: ['referentiel-public'] as const,
  regions: () => [...referentielPublicQueryKeys.all, 'regions'] as const,
  villes: () => [...referentielPublicQueryKeys.all, 'villes'] as const,
  quartiers: (villeId: number | null) => [...referentielPublicQueryKeys.all, 'quartiers', villeId] as const,
  equipements: () => [...referentielPublicQueryKeys.all, 'equipements'] as const,
  // TCK-1229 (P103.04) — les comptes par type du menu « Plus » de la barre publique.
  typesDeBien: () => [...referentielPublicQueryKeys.all, 'types-de-bien'] as const,
};

/**
 * Les 14 régions — TCK-635 (ADR-0062 §8) : leur nom départage les villes homonymes, que la liste
 * des villes ne porte que par `region_id`.
 */
export function useRegionsDuReferentiel(actif = true) {
  return useApiQuery<ListeDuReferentiel<RegionDuReferentiel>>(
    referentielPublicQueryKeys.regions(),
    '/api/public/geo/regions',
    { staleTime: UNE_HEURE_MS, enabled: actif },
  );
}

/** Toutes les villes du référentiel — le panneau ne demande pas de région d'abord. */
export function useVillesDuReferentiel(actif = true) {
  return useApiQuery<ListeDuReferentiel<VilleDuReferentiel>>(
    referentielPublicQueryKeys.villes(),
    '/api/public/geo/cities',
    { staleTime: UNE_HEURE_MS, enabled: actif },
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
export function useEquipementsApprouves(actif = true) {
  return useApiQuery<ListeDuReferentiel<EquipementDuCatalogue>>(
    referentielPublicQueryKeys.equipements(),
    '/api/public/amenities',
    { staleTime: UNE_HEURE_MS, enabled: actif },
  );
}
