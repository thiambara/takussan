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
 * `notification_frequency` enum (`off|daily|weekly|instant`). We default to
 * `off` when the UI hasn't collected a frequency.
 */

'use client';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import type { SavedSearchPayload } from '@/lib/schemas/search';

export type SavedSearchNotificationFrequency =
  | 'off'
  | 'daily'
  | 'weekly'
  | 'instant';

export interface SavedSearch {
  id: number;
  user_id: number;
  name: string;
  criteria: Record<string, unknown>;
  notification_frequency: SavedSearchNotificationFrequency | null;
  is_active: boolean;
  results_count: number | null;
  created_at: string | null;
}

export const savedSearchesQueryKeys = {
  all: ['saved-searches'] as const,
  list: () => ['saved-searches', 'list'] as const,
};

export function useSavedSearchesQuery(options: { enabled?: boolean } = {}) {
  return useApiQuery<{ data: SavedSearch[] }>(
    savedSearchesQueryKeys.list(),
    '/api/saved-searches',
    { enabled: options.enabled },
  );
}

export function useCreateSavedSearchMutation() {
  return useApiMutation<{ data: SavedSearch }, SavedSearchPayload>(
    { path: '/api/saved-searches', method: 'POST' },
    { invalidate: [savedSearchesQueryKeys.all] },
  );
}

export function useDeleteSavedSearchMutation() {
  return useApiMutation<unknown, { id: number }>(
    {
      path: ({ id }) => `/api/saved-searches/${id}`,
      method: 'DELETE',
      body: () => undefined,
    },
    { invalidate: [savedSearchesQueryKeys.all] },
  );
}
