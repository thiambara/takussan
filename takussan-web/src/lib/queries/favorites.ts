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
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { useMemo } from 'react';
import { apiRequest, buildQueryString, type ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
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

// ─── Public lookup by IDs (used by the anonymous favorites popover) ─────

export interface PropertiesByIdsResponse {
  data: PropertyListItem[];
  meta: {
    requested_ids: number[];
    returned_ids: number[];
  };
}

/**
 * Resolve a batch of property IDs through the public endpoint
 * (`GET /public/properties/by-ids?ids=1,2,3`). Used to hydrate the navbar
 * favorites popover for anonymous users — the IDs come from the local
 * favorites store.
 *
 * Unpublished / deleted IDs are silently dropped server-side; callers can
 * compare `meta.requested_ids` vs `meta.returned_ids` to purge ghosts from
 * the local store.
 */
export function usePropertiesByIdsQuery(ids: readonly number[]) {
  const sorted = [...ids].sort((a, b) => a - b);
  return useApiQuery<PropertiesByIdsResponse>(
    ['public-properties-by-ids', sorted],
    '/api/public/properties/by-ids',
    {
      params: { extra: { ids: sorted.join(',') } },
      enabled: sorted.length > 0,
    },
  );
}

// Backend cap on /public/properties/by-ids?ids=… (PublicPropertyController).
const BY_IDS_CHUNK_SIZE = 20;

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Resolve any number of property IDs through the public by-ids endpoint by
 * splitting the request into chunks of {@link BY_IDS_CHUNK_SIZE}. Used by the
 * `/favorites` page to render the full list when an anonymous user has stored
 * more than the per-request cap.
 *
 * The merged shape mirrors {@link PropertiesByIdsResponse} so callers can
 * still purge ghosts by comparing `meta.requested_ids` vs `meta.returned_ids`.
 */
export function usePropertiesByIdsChunkedQuery(ids: readonly number[]) {
  const locale = useLocale();
  const { token } = useAuth();
  const sorted = useMemo(() => [...ids].sort((a, b) => a - b), [ids]);
  const chunks = useMemo(() => chunk(sorted, BY_IDS_CHUNK_SIZE), [sorted]);

  const results = useQueries({
    queries: chunks.map((chunkIds) => ({
      queryKey: ['public-properties-by-ids', chunkIds] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const qs = buildQueryString({ extra: { ids: chunkIds.join(',') } });
        return apiRequest<PropertiesByIdsResponse>(
          `/api/public/properties/by-ids${qs ? `?${qs}` : ''}`,
          { token: token ?? undefined, locale, signal },
        );
      },
      enabled: chunkIds.length > 0,
    })),
  });

  return useMemo(() => {
    const isLoading = results.some((r) => r.isLoading);
    const isError = results.some((r) => r.isError);
    const error = (results.find((r) => r.isError)?.error as ApiError | undefined) ?? null;
    const allLoaded = results.length > 0 && results.every((r) => r.data);

    if (sorted.length === 0) {
      return { data: undefined, isLoading: false, isError: false, error: null } as const;
    }
    if (!allLoaded) {
      return { data: undefined, isLoading, isError, error } as const;
    }

    const merged: PropertiesByIdsResponse = {
      data: results.flatMap((r) => r.data!.data),
      meta: {
        requested_ids: results.flatMap((r) => r.data!.meta.requested_ids),
        returned_ids: results.flatMap((r) => r.data!.meta.returned_ids),
      },
    };
    return { data: merged, isLoading: false, isError, error } as const;
  }, [results, sorted.length]);
}
