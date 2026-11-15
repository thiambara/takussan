'use client';

import { useApiQuery } from '@/hooks/useApiQuery';
import { useAuth } from '@/context/AuthContext';
import type { PaginatedResponse } from '@/types/api';

import { conversationListParams, type ConversationListPage } from './conversations-list';
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

/**
 * TCK-2853 — « Sokhna Sène vous a répondu » (accueil du client, bureau) : le fil DIRECT non lu le plus
 * récent, filtré par le SERVEUR (`filter[unread]=1`, `filter[type]=direct`, TCK-2630), une ligne.
 * Est non lu, pour l'API, un message d'un AUTRE postérieur à la lecture du client, hors avis système :
 * le fil rendu porte donc toujours une réponse d'un autre. La clé vit sous `['conversations', 'list']` :
 * ouvrir le fil (`useMarkConversationRead`) invalide ce préfixe, et la rangée disparaît.
 */
export function useReponseRecue() {
  const { token } = useAuth();
  return useApiQuery<ConversationListPage>(['conversations', 'list', 'accueil-client-reponse'] as const, '/api/conversations', {
    params: conversationListParams(1, 1, { nonLus: true, type: 'direct' }),
    enabled: !!token,
  });
}
