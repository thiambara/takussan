/**
 * Saved searches — React Query hooks + query keys.
 *
 * Backend contract (live on `dev`, `routes/api/saved-searches.php`) :
 * - `GET  /api/saved-searches`      → `{ data: SavedSearch[] }` (auth)
 * - `POST /api/saved-searches`      → `{ data: SavedSearch }` — accepts
 *   `{ name, criteria: Record<string, unknown>, notification_frequency? }`
 * - `PUT  /api/saved-searches/{id}` → partial update
 * - `DELETE /api/saved-searches/{id}` → 204
 *
 * Ticket TCK-047 refers to a `notify` boolean — backend exposes the richer
 * `notification_frequency` enum (`off|daily|weekly`). We default to
 * `off` when the UI hasn't collected a frequency.
 */

'use client';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import type { SavedSearchPayload } from '@/lib/schemas/search';
import { cheminApi } from '@/lib/chemin-api';

/** `instant` retiré par TCK-599 (porteur, 2026-10-06) : l'API le refuse en 422. */
export type SavedSearchNotificationFrequency = 'off' | 'daily' | 'weekly';

export interface SavedSearch {
  id: number;
  user_id: number;
  name: string;
  criteria: Record<string, unknown>;
  notification_frequency: SavedSearchNotificationFrequency | null;
  is_active: boolean;
  results_count: number | null;
  /**
   * TCK-599 — les canaux EFFECTIFS de l'alerte pour cet utilisateur (`inapp` toujours ; `email`,
   * `whatsapp` selon ses préférences), vide pour une alerte coupée. L'interface dit par où
   * l'alerte arrivera à partir de ceci, jamais d'une supposition.
   */
  alert_channels?: SavedSearchAlertChannel[];
  created_at: string | null;
}

export type SavedSearchAlertChannel = 'inapp' | 'email' | 'whatsapp';

/** Les fréquences qu'une ligne de `/app/saved-searches` propose, dans l'ordre affiché. */
export const SAVED_SEARCH_FREQUENCIES: readonly SavedSearchNotificationFrequency[] = [
  'off',
  'daily',
  'weekly',
];

export const SAVED_SEARCH_FIELDS = [
  'id',
  'user_id',
  'name',
  'criteria',
  'notification_frequency',
  'is_active',
] as const;

export const savedSearchesQueryKeys = {
  all: ['saved-searches'] as const,
  list: () => ['saved-searches', 'list'] as const,
};

export function useSavedSearchesQuery(options: { enabled?: boolean } = {}) {
  return useApiQuery<{ data: SavedSearch[] }>(
    savedSearchesQueryKeys.list(),
    '/api/saved-searches',
    {
      enabled: options.enabled,
      params: { fields: { saved_searches: SAVED_SEARCH_FIELDS } },
    },
  );
}

export function useCreateSavedSearchMutation() {
  return useApiMutation<{ data: SavedSearch }, SavedSearchPayload>(
    { path: '/api/saved-searches', method: 'POST' },
    { invalidate: [savedSearchesQueryKeys.all] },
  );
}

export type UpdateSavedSearchPayload = {
  id: number;
  name?: string;
  criteria?: Record<string, unknown>;
  notification_frequency?: SavedSearchNotificationFrequency;
  is_active?: boolean;
};

/**
 * Le segment d'URL d'une recherche sauvegardée : un entier sûr, ou rien — jamais un `../` ni un
 * `?` glissé par un appelant non typé.
 */
export function cheminRecherche(id: unknown): string {
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
    throw new RangeError('saved_search.invalid_id');
  }
  return cheminApi`/api/saved-searches/${id}`;
}

export function useUpdateSavedSearchMutation() {
  return useApiMutation<{ data: SavedSearch }, UpdateSavedSearchPayload>(
    {
      path: ({ id }) => cheminRecherche(id),
      method: 'PATCH',
      body: ({ id: _id, ...rest }) => rest,
    },
    { invalidate: [savedSearchesQueryKeys.all] },
  );
}

export function useDeleteSavedSearchMutation() {
  return useApiMutation<unknown, { id: number }>(
    {
      path: ({ id }) => cheminRecherche(id),
      method: 'DELETE',
      body: () => undefined,
    },
    { invalidate: [savedSearchesQueryKeys.all] },
  );
}
