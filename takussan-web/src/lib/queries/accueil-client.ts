'use client';

import { useApiQuery } from '@/hooks/useApiQuery';
import { useAuth } from '@/context/AuthContext';
import type { PaginatedResponse } from '@/types/api';

import { favoritesQueryKeys, type FavoriteItem } from './favorites';

/** Les favoris montrés sur l'accueil du client : deux vignettes, comme la maquette. */
export const FAVORIS_QUI_BOUGENT = 2;

/**
 * TCK-2625 — « Vos favoris ont bougé » : `GET /api/favorites?filter[price_changed]=1`, filtré par le
 * SERVEUR (biens publics dont le prix diffère de celui de l'ajout, `FavoriteController::index`). La clé
 * vit sous `favoritesQueryKeys.all` : retirer un favori (qui invalide `['favorites']`) la relit.
 */
export function useFavorisQuiBougent() {
  const { token } = useAuth();
  return useApiQuery<PaginatedResponse<FavoriteItem>>(
    [...favoritesQueryKeys.all, 'prix-change', { per_page: FAVORIS_QUI_BOUGENT }] as const,
    '/api/favorites',
    { params: { filter: { price_changed: 1 }, per_page: FAVORIS_QUI_BOUGENT }, enabled: !!token },
  );
}
