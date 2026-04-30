/**
 * Favorites — React Query hooks + query keys.
 *
 * Backend contract (live on `dev`) :
 * - `GET  /api/favorites`                → paginated list, property + address eager-loaded
 * - `POST /api/favorites  { property_id }` → 201 with the new Favorite
 * - `DELETE /api/favorites/{property}`   → 204 (note: the URL segment is the
 *   **property id**, not the favorite id — see route defintion in
 *   `routes/api/properties.php`).
 *
 * The ticket TCK-047 mentions `POST/DELETE /api/properties/{property}/favorite`
 * but the live backend exposes the above. Frontend follows live backend —
 * flagged as spec divergence in the PR description.
 */

'use client';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import { useQueryClient } from '@tanstack/react-query';
import type { PaginatedResponse } from '@/types/api';
import type { PropertyListItem } from '@/types/property';

export interface FavoriteItem {
  id: number;
  property_id: number;
  user_id: number;
  notes: string | null;
  property: PropertyListItem & {
    // API `PropertyResource` includes address on .property via include=.
    [extra: string]: unknown;
  };
  created_at: string;
}

export const favoritesQueryKeys = {
  all: ['favorites'] as const,
  list: (page = 1, perPage = 20) =>
    ['favorites', 'list', { page, per_page: perPage }] as const,
};

/**
 * List the current user's favorites (auth required).
 */
export function useFavoritesQuery(params: { page?: number; per_page?: number } = {}) {
  const page = params.page ?? 1;
  const perPage = params.per_page ?? 20;
  return useApiQuery<PaginatedResponse<FavoriteItem>>(
    favoritesQueryKeys.list(page, perPage),
    '/api/favorites',
    { params: { page, per_page: perPage } },
  );
}

/**
 * Add a favorite. Invalidates the favorites list on success.
 */
export function useAddFavoriteMutation() {
  return useApiMutation<{ data: FavoriteItem }, { property_id: number }>(
    { path: '/api/favorites', method: 'POST' },
    { invalidate: [favoritesQueryKeys.all] },
  );
}

/**
 * Remove a favorite by property id. Invalidates the favorites list.
 */
export function useRemoveFavoriteMutation() {
  return useApiMutation<unknown, { property_id: number }>(
    {
      path: ({ property_id }) => `/api/favorites/${property_id}`,
      method: 'DELETE',
      body: () => undefined,
    },
    { invalidate: [favoritesQueryKeys.all] },
  );
}

/**
 * Imperative helper — prime the favorites cache (used by the detail page
 * after the SSR pass already knows whether the user favorited a property).
 */
export function useInvalidateFavorites() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: favoritesQueryKeys.all });
}
