'use client';

/**
 * TanStack Query wrappers for the maintenance domain.
 *
 * Every read funnels through `useApiQuery`, which serialises spatie
 * params (`fields[]`, `filter[]`, `include=`, `sort=`) — see
 * `docs/spatie-query-builder.md` and CLAUDE.md → "API — Conventions
 * frontend". Every write goes through `useApiMutation` so we stay
 * consistent with the rest of the app.
 */

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import type { PaginatedResponse, ApiResponse, SpatieQueryParams } from '@/types/api';
import type {
  MaintenanceCategory,
  MaintenancePriority,
  MaintenanceRequest,
  MaintenanceStatus,
} from '@/types/maintenance';
import type {
  MaintenanceCompleteInput,
  MaintenanceCreateInput,
  MaintenanceStatusInput,
  MaintenanceUpdateInput,
} from '@/lib/schemas/maintenance';

/** Keys used as TanStack Query cache keys — centralise for invalidation. */
export const maintenanceKeys = {
  all: ['maintenance'] as const,
  list: (params?: MaintenanceListParams) => ['maintenance', 'list', params ?? {}] as const,
  byProperty: (propertyId: number, params?: MaintenanceListParams) =>
    ['maintenance', 'property', propertyId, params ?? {}] as const,
  detail: (id: number) => ['maintenance', 'detail', id] as const,
};

/** Sparse fieldsets — keep responses minimal (CLAUDE.md rule #1). */
const LIST_FIELDS = [
  'id',
  'property_id',
  'lease_id',
  'requester_id',
  'assigned_to',
  'title',
  'category',
  'priority',
  'status',
  'scheduled_at',
  'completed_at',
  'actual_cost',
  'created_at',
] as const;

const DETAIL_FIELDS = [...LIST_FIELDS, 'description', 'estimated_cost', 'started_at', 'resolution_notes'] as const;

export interface MaintenanceListParams {
  readonly status?: MaintenanceStatus;
  readonly priority?: MaintenancePriority;
  readonly category?: MaintenanceCategory;
  readonly property_id?: number;
  readonly page?: number;
  readonly per_page?: number;
  readonly sort?: string;
  readonly search?: string;
}

function toSpatieParams(
  params: MaintenanceListParams | undefined,
  fields: readonly string[],
): SpatieQueryParams {
  const filter: SpatieQueryParams['filter'] = {};
  if (params?.status) filter.status = params.status;
  if (params?.priority) filter.priority = params.priority;
  if (params?.category) filter.category = params.category;
  if (params?.property_id) filter.property_id = params.property_id;
  if (params?.search) filter.search = params.search;

  return {
    fields: { maintenance_requests: [...fields] },
    filter: Object.keys(filter).length ? filter : undefined,
    sort: params?.sort ?? '-created_at',
    page: params?.page,
    per_page: params?.per_page ?? 20,
  };
}

/** `GET /api/maintenance-requests` (visible-to-user scope + spatie filters). */
export function useMaintenanceRequests(params?: MaintenanceListParams) {
  return useApiQuery<PaginatedResponse<MaintenanceRequest>>(
    maintenanceKeys.list(params),
    '/api/maintenance-requests',
    { params: toSpatieParams(params, LIST_FIELDS) },
  );
}

/** `GET /api/properties/{property}/maintenance-requests` (history per bien). */
export function useMaintenanceHistoryForProperty(
  propertyId: number | null,
  params?: MaintenanceListParams,
) {
  return useApiQuery<PaginatedResponse<MaintenanceRequest>>(
    maintenanceKeys.byProperty(propertyId ?? 0, params),
    `/api/properties/${propertyId}/maintenance-requests`,
    {
      params: toSpatieParams(params, LIST_FIELDS),
      enabled: propertyId !== null && propertyId > 0,
    },
  );
}

/** `GET /api/maintenance-requests/{id}`. */
export function useMaintenanceRequest(id: number | null) {
  return useApiQuery<ApiResponse<MaintenanceRequest>>(
    maintenanceKeys.detail(id ?? 0),
    `/api/maintenance-requests/${id}`,
    {
      params: { fields: { maintenance_requests: [...DETAIL_FIELDS] } },
      enabled: id !== null && id > 0,
    },
  );
}

/** `POST /api/maintenance-requests`. */
export function useCreateMaintenanceRequest() {
  return useApiMutation<ApiResponse<MaintenanceRequest>, MaintenanceCreateInput>(
    { path: '/api/maintenance-requests', method: 'POST' },
    { invalidate: [maintenanceKeys.all] },
  );
}

/** `PUT /api/maintenance-requests/{id}` — generic update (assign, schedule, cost). */
export function useUpdateMaintenanceRequest(id: number) {
  return useApiMutation<ApiResponse<MaintenanceRequest>, MaintenanceUpdateInput>(
    { path: `/api/maintenance-requests/${id}`, method: 'PUT' },
    {
      invalidate: [maintenanceKeys.all, maintenanceKeys.detail(id)],
    },
  );
}

/** `PUT /api/maintenance-requests/{id}/status` — validated transition. */
export function useTransitionMaintenanceStatus(id: number) {
  return useApiMutation<ApiResponse<MaintenanceRequest>, MaintenanceStatusInput>(
    { path: `/api/maintenance-requests/${id}/status`, method: 'PUT' },
    {
      invalidate: [maintenanceKeys.all, maintenanceKeys.detail(id)],
    },
  );
}

/** `PUT /api/maintenance-requests/{id}/complete`. */
export function useCompleteMaintenanceRequest(id: number) {
  return useApiMutation<ApiResponse<MaintenanceRequest>, MaintenanceCompleteInput>(
    { path: `/api/maintenance-requests/${id}/complete`, method: 'PUT' },
    {
      invalidate: [maintenanceKeys.all, maintenanceKeys.detail(id)],
    },
  );
}

/**
 * `POST /api/maintenance-requests/{id}/photos` — multipart upload.
 * `collection` selects the medialibrary collection:
 *   - `photos` (default) — initial report imagery
 *   - `completion_photos` — post-resolution evidence (manager-only)
 *
 * The `id` is passed per-call rather than at hook bind time so the same
 * mutation can target requests created within the same form flow.
 */
export interface UploadMaintenancePhotosInput {
  readonly id: number;
  readonly files: readonly File[];
  readonly collection?: 'photos' | 'completion_photos';
}

export function useUploadMaintenancePhotos() {
  return useApiMutation<unknown, UploadMaintenancePhotosInput>(
    {
      path: ({ id }) => `/api/maintenance-requests/${id}/photos`,
      method: 'POST',
      formData: true,
      body: ({ files, collection }) => {
        const fd = new FormData();
        for (const file of files) fd.append('photos[]', file);
        if (collection) fd.append('collection', collection);
        return fd;
      },
    },
    {
      invalidate: ({ variables }) => [maintenanceKeys.detail(variables.id), maintenanceKeys.all],
    },
  );
}
