/**
 * Favorites — React Query hooks + query keys.
 *
 * Backend contract (TCK-599, ADR-0050) :
 * - `GET  /api/favorites?page=&per_page=` (`per_page` 1-50) → paginated list. Each item carries
 *   `availability` ; `property` is the full card ONLY when `available`, otherwise the minimal
 *   projection `{ id, slug, title }`, and `null` for a removed property.
 * - `POST /api/favorites  { property_id }` → 201 with the same projection, or 404 — identical
 *   for an unknown id and a property the caller may not see.
 * - `PATCH /api/favorites/{property}  { notes }` → personal note, ≤ 500 characters.
 * - `DELETE /api/favorites/{property}` → 204. The URL segment is the **property id**, not the
 *   favorite id (`routes/api/properties.php`) ; DELETE and PATCH accept a removed property.
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

export type FavoriteAvailability = 'available' | 'rented' | 'sold' | 'unavailable' | 'removed';

/** Ce que l'API rend d'un bien qui n'est plus disponible : de quoi le nommer, rien de plus. */
export interface FavoritePropertyStub {
  id: number;
  slug: string | null;
  title: string | null;
}

export const FAVORITE_NOTES_MAX = 500;

export type FavoriteItem = {
  id: number;
  property_id: number;
  user_id: number;
  notes: string | null;
  created_at: string;
} & (
  | {
      availability: 'available';
      property: PropertyListItem & {
        // API `PropertyResource` includes address on .property via include=.
        [extra: string]: unknown;
      };
    }
  | {
      availability: Exclude<FavoriteAvailability, 'available'>;
      property: FavoritePropertyStub | null;
    }
);

/**
 * Le segment d'URL d'un favori est l'identifiant du BIEN. Il vient d'une réponse de l'API, mais
 * un nombre qui n'en est pas un (`NaN`, `1e21`, une chaîne glissée par un appelant non typé)
 * ferait d'un `PATCH` une requête vers un autre chemin : on refuse plutôt que de l'écrire.
 */
export function cheminFavori(propertyId: unknown): string {
  if (typeof propertyId !== 'number' || !Number.isSafeInteger(propertyId) || propertyId <= 0) {
    throw new RangeError('favorite.invalid_property_id');
  }
  return `/api/favorites/${propertyId}`;
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
  const { token } = useAuth();
  return useApiQuery<PaginatedResponse<FavoriteItem>>(
    favoritesQueryKeys.list(page, perPage),
    '/api/favorites',
    { params: { page, per_page: perPage }, enabled: !!token },
  );
}

/** La borne de l'API (`IndexFavoriteRequest::MAX_PER_PAGE`) : au-delà, 422. */
export const FAVORITES_MAX_PER_PAGE = 50;

/** Garde-fou de la boucle : 40 pages de 50, bien au-delà de tout usage observé. */
const FAVORITES_MAX_PAGES = 40;

/**
 * TCK-599 — les identifiants de TOUS les biens en favori, page par page.
 *
 * ⚠ Remplace un `GET /api/favorites?per_page=100` que l'API refuse désormais en 422 (borne
 * 1-50, AC5) : l'appelant l'avalait en « best-effort », et les cœurs d'un utilisateur connecté
 * seraient restés vides sans un mot.
 */
export async function fetchAllFavoritePropertyIds(token: string): Promise<number[]> {
  const ids: number[] = [];
  for (let page = 1; page <= FAVORITES_MAX_PAGES; page++) {
    const res = await apiRequest<PaginatedResponse<FavoriteItem>>(
      `/api/favorites?page=${page}&per_page=${FAVORITES_MAX_PER_PAGE}`,
      { token },
    );
    ids.push(...res.data.map((f) => f.property_id));
    if (page >= (res.meta?.last_page ?? 1)) break;
  }
  return ids;
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
      path: ({ property_id }) => cheminFavori(property_id),
      method: 'DELETE',
      body: () => undefined,
    },
    { invalidate: [favoritesQueryKeys.all] },
  );
}

/**
 * TCK-599 — la note personnelle d'un favori, éditée en place. `null` ou `''` l'efface.
 */
export function useUpdateFavoriteNotesMutation() {
  return useApiMutation<{ data: FavoriteItem }, { property_id: number; notes: string | null }>(
    {
      path: ({ property_id }) => cheminFavori(property_id),
      method: 'PATCH',
      body: ({ notes }) => ({ notes: notes === null || notes.trim() === '' ? null : notes }),
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
