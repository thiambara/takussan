'use client';

/**
 * TCK-279 — catalogue plateforme des capacités (`GET /api/capabilities`).
 *
 * Le catalogue est **code-defined** (ADR-0003) : il ne change qu'avec un
 * déploiement. D'où `staleTime: Infinity` — le refetcher à chaque montage de
 * la matrice serait une requête par ouverture d'écran pour une réponse qui ne
 * bouge pas de la journée.
 */

import { useApiQuery } from '@/hooks/useApiQuery';
import type { ApiResponse } from '@/types/api';
import type { CapabilityCatalogue, CapabilityValue } from '@/types/agency-role';

export const capabilityKeys = {
  all: ['capabilities'] as const,
  catalogue: () => ['capabilities', 'catalogue'] as const,
};

/**
 * ⚠️ Le chemin porte `/api` : `useApiQuery` ne l'ajoute PAS (seul `apiFetch`
 * le fait). L'oublier ne rend pas un 404 propre mais un `net::ERR_FAILED` par
 * CORS — cf. `takussan-web/CLAUDE.md`.
 */
export function useCapabilityCatalogue() {
  return useApiQuery<ApiResponse<CapabilityCatalogue>>(
    capabilityKeys.catalogue(),
    '/api/capabilities',
    { staleTime: Infinity, gcTime: Infinity },
  );
}

/**
 * `true` si la capacité est réservée à la plateforme et ne peut donc PAS être
 * accordée à un rôle d'agence.
 *
 * La matrice s'en sert pour griser la case. Ce n'est pas une garde — l'API
 * refuse ces valeurs en 422 — c'est ce qui évite d'offrir un geste qui échoue.
 */
export function isPlatformReserved(
  catalogue: CapabilityCatalogue | undefined,
  capability: CapabilityValue,
): boolean {
  return catalogue?.platform_reserved.includes(capability) ?? false;
}
