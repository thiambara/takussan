'use client';

import { useApiQuery } from '@/hooks/useApiQuery';
import { UNE_HEURE_MS } from '@/lib/queries/referentiel-public';
import { cheminApi } from '@/lib/chemin-api';

/**
 * TCK-2603 (ADR-0088, amendement du 2026-11-10, cinquième sortie) — combien de recherches des 7 derniers jours visent
 * une ville, lu sans compte au départ de `/publish` : `GET /api/public/publish/demand?city=`.
 *
 * - L'API rend le total ARRONDI à la dizaine inférieure, ou `null` sous le seuil (200) : le front n'arrondit rien et
 *   n'invente rien.
 * - Sans ville, l'API nomme la ville la plus recherchée.
 * - **Aucune nouvelle tentative** : un chiffre de vitrine absent ne vaut pas qu'on fasse attendre l'écran, et la carte
 *   n'apparaît qu'une fois le chiffre reçu (AC3).
 *
 * ⚠ `useApiQuery` n'ajoute PAS `/api` : le chemin l'écrit (`takussan-web/CLAUDE.md`).
 */
export interface DemandeDePublication {
  readonly city: string;
  readonly searches_7d: number | null;
}

export const demandeDePublicationQueryKeys = {
  all: ['demande-de-publication'] as const,
  ville: (ville: string | null) => [...demandeDePublicationQueryKeys.all, ville] as const,
};

export function useDemandeDePublication(ville: string | null = null) {
  return useApiQuery<{ readonly data: DemandeDePublication }>(
    demandeDePublicationQueryKeys.ville(ville),
    ville === null ? '/api/public/publish/demand' : cheminApi`/api/public/publish/demand${new URLSearchParams({ city: ville })}`,
    { staleTime: UNE_HEURE_MS, retry: false },
  );
}
