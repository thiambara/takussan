'use client';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import { cheminApi } from '@/lib/chemin-api';
import type { BoostProduct, BuyBoostResponse, CreditsResponse, PropertyBoostsResponse } from './types';

/** TCK-633 lot F — les clés de cache : un achat invalide le solde et l'historique. */
export const CLE_CREDITS = ['credits'] as const;
export const CLE_OFFRES = ['boost-products'] as const;

/**
 * TCK-824 (P24.02) — les boosts d'un bien et la fin du délai de Remontée, lus à l'ouverture du
 * dialogue d'achat. La clé commence par `properties` : l'achat, qui invalide `['properties']`, la
 * rafraîchit aussi.
 */
export function usePropertyBoosts(propertyId: number, enabled = true) {
  return useApiQuery<PropertyBoostsResponse>(['properties', propertyId, 'boosts'], cheminApi`/api/properties/${propertyId}/boosts`, {
    enabled,
  });
}

/** `enabled` : le dialogue ne tire rien tant qu'il n'est pas ouvert. */
export function useCredits(enabled = true, page = 1) {
  return useApiQuery<CreditsResponse>([...CLE_CREDITS, page], '/api/credits', {
    enabled,
    params: { page, per_page: 20 },
  });
}

export function useBoostProducts(enabled = true) {
  return useApiQuery<{ readonly data: readonly BoostProduct[] }>([...CLE_OFFRES], '/api/boost-products', {
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * TCK-822 (P24.01) — `cleIdempotence` part dans l'en-tête `Idempotency-Key` : l'API rejoue en 200,
 * sans second débit, un achat déjà fait avec la même clé (réponse perdue, puis « Confirmer » de nouveau).
 */
export function useBuyBoost(propertyId: number, cleIdempotence: string) {
  return useApiMutation<BuyBoostResponse, { readonly product_id: number }>(
    { path: cheminApi`/api/properties/${propertyId}/boosts`, method: 'POST' },
    {
      invalidate: [[...CLE_CREDITS], ['properties']],
      request: { headers: { 'Idempotency-Key': cleIdempotence } },
    },
  );
}
