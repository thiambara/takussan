'use client';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import type { ApiResponse, PaginatedResponse, SpatieQueryParams } from '@/types/api';
import type {
  PropertyVisit,
  VisitFeedbackPayload,
  VisitStatus,
  VisitType,
} from '@/types/visit';

/**
 * TCK-075 — React Query hooks for `/api/property-visits`.
 *
 * Following the project-wide spatie conventions (CLAUDE.md → "API —
 * Conventions frontend"): every list/detail request uses
 * `fields[property_visits]`, declares its includes explicitly, and
 * pushes filtering to the backend rather than the client.
 */

export const VISIT_LIST_FIELDS: string[] = [
  'id',
  'property_id',
  'visitor_id',
  'agent_id',
  'type',
  'status',
  'scheduled_at',
  'completed_at',
  'duration_minutes',
  'created_at',
];

export const VISIT_DETAIL_FIELDS: string[] = [
  ...VISIT_LIST_FIELDS,
  'customer_id',
  'visitor_name',
  'visitor_phone',
  'visitor_email',
  'cancelled_at',
  'cancellation_reason',
  'feedback',
  'rating',
  'notes',
  'metadata',
];

export type UseVisitsParams = {
  status?: VisitStatus;
  type?: VisitType;
  property_id?: number;
  /** ISO date-time. */
  scheduled_at_min?: string;
  /** ISO date-time. */
  scheduled_at_max?: string;
  page?: number;
  per_page?: number;
  sort?: string;
};

export const visitsQueryKeys = {
  list: (params: UseVisitsParams) => ['visits', 'list', params] as const,
  detail: (id: number | null | undefined) => ['visits', 'detail', id] as const,
  /** TCK-377 — compteur du menu. Clé distincte de `list` : ce n'est pas une page de liste. */
  pendingCount: () => ['visits', 'pending-count'] as const,
};

/**
 * TCK-377 — Nombre de demandes de visite EN ATTENTE, pour la pastille de la barre latérale.
 *
 * ⚠ Trois points où le ticket décrivait une API qui n'existe pas, mesurés le 2026-08-27 :
 *
 *  1. l'endpoint est `/api/property-visits`, pas `/api/visits` (`routes/api/property-visits.php`) ;
 *  2. il n'existe **aucun** statut `pending`. `App\Models\Enums\VisitStatus` en compte cinq —
 *     `scheduled`, `confirmed`, `completed`, `cancelled`, `no_show` — et « en attente » est
 *     `scheduled`, que le front affiche déjà « Demandée » (`visits.status.scheduled`) ;
 *  3. le compte se lit dans `meta.total`, pas dans `meta.pending_count`. Ce dernier n'existe que
 *     sur les deux files de modération qu'`AdminSidebar` sonde — c'est un champ que ces
 *     contrôleurs ajoutent, pas une propriété de l'enveloppe paginée.
 *
 * `per_page: 1` et `fields[property_visits]=id` : on ne veut que l'en-tête de pagination, jamais
 * la page. La cadence de 60 s est celle d'`AdminSidebar` — un menu n'est pas un cron.
 */
export function usePendingVisitsCount(options: { enabled?: boolean } = {}) {
  const spatieParams: SpatieQueryParams = {
    fields: { property_visits: ['id'] },
    filter: { status: 'scheduled' },
    page: 1,
    per_page: 1,
  };

  return useApiQuery<PaginatedResponse<PropertyVisit>>(
    visitsQueryKeys.pendingCount(),
    '/api/property-visits',
    {
      params: spatieParams,
      enabled: options.enabled ?? true,
      refetchInterval: 60_000,
      staleTime: 30_000,
    },
  );
}

export function useVisits(params: UseVisitsParams = {}) {
  const {
    status,
    type,
    property_id,
    scheduled_at_min,
    scheduled_at_max,
    page,
    per_page,
    sort,
  } = params;

  const spatieParams: SpatieQueryParams = {
    fields: {
      property_visits: VISIT_LIST_FIELDS,
      // `main_photo_url` is a computed attribute (Spatie media library), not a
      // DB column, so it must NOT appear in `fields[properties]`. The API
      // resource emits it unconditionally, so it's still present in the response.
      properties: ['id', 'title', 'slug'],
      users: ['id', 'first_name', 'last_name'],
    },
    filter: {
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(property_id ? { property_id: String(property_id) } : {}),
      ...(scheduled_at_min ? { scheduled_at_min } : {}),
      ...(scheduled_at_max ? { scheduled_at_max } : {}),
    },
    include: ['property', 'agent', 'visitor'],
    sort: [sort ?? 'scheduled_at'],
    page: page ?? 1,
    per_page: per_page ?? 20,
  };

  return useApiQuery<PaginatedResponse<PropertyVisit>>(
    visitsQueryKeys.list(params),
    '/api/property-visits',
    { params: spatieParams },
  );
}

export function useVisit(id: number | null | undefined) {
  const spatieParams: SpatieQueryParams = {
    fields: {
      property_visits: VISIT_DETAIL_FIELDS,
      properties: ['id', 'title', 'slug'],
      users: ['id', 'first_name', 'last_name', 'email', 'phone'],
      customers: ['id', 'user_id', 'first_name', 'last_name', 'email', 'phone'],
    },
    include: ['property', 'agent', 'visitor', 'customer'],
  };

  return useApiQuery<ApiResponse<PropertyVisit>>(
    visitsQueryKeys.detail(id),
    `/api/property-visits/${id ?? ''}`,
    {
      params: spatieParams,
      enabled: Boolean(id),
    },
  );
}

export function useConfirmVisit(id: number) {
  return useApiMutation<ApiResponse<PropertyVisit>, void>(
    { path: `/api/property-visits/${id}/confirm`, method: 'POST' },
    {
      invalidate: [
        ['visits', 'list'],
        ['visits', 'detail', id],
      ],
    },
  );
}

export function useCompleteVisit(id: number) {
  return useApiMutation<
    ApiResponse<PropertyVisit>,
    { feedback?: string; rating?: number }
  >(
    { path: `/api/property-visits/${id}/complete`, method: 'POST' },
    {
      invalidate: [
        ['visits', 'list'],
        ['visits', 'detail', id],
      ],
    },
  );
}

export function useCancelVisit(id: number) {
  return useApiMutation<ApiResponse<PropertyVisit>, { reason?: string }>(
    { path: `/api/property-visits/${id}/cancel`, method: 'POST' },
    {
      invalidate: [
        ['visits', 'list'],
        ['visits', 'detail', id],
      ],
    },
  );
}

export function useUpdateVisit(id: number) {
  return useApiMutation<
    ApiResponse<PropertyVisit>,
    { scheduled_at?: string; duration_minutes?: number; notes?: string }
  >(
    { path: `/api/property-visits/${id}`, method: 'PATCH' },
    {
      invalidate: [
        ['visits', 'list'],
        ['visits', 'detail', id],
      ],
    },
  );
}

export function useSubmitVisitFeedback(id: number) {
  return useApiMutation<ApiResponse<PropertyVisit>, VisitFeedbackPayload>(
    { path: `/api/property-visits/${id}/feedback`, method: 'POST' },
    {
      invalidate: [
        ['visits', 'list'],
        ['visits', 'detail', id],
      ],
    },
  );
}
