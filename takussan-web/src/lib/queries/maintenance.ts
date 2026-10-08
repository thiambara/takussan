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
import type { ServiceProviderProfileSummary } from '@/lib/queries/service-providers';
import { SERVICE_PROVIDER_PROFILE_FIELDS } from '@/lib/queries/service-providers';
import type {
  MaintenanceCategory,
  MaintenancePriority,
  MaintenanceQuoteLineKind,
  MaintenanceRequest,
  MaintenanceStatus,
} from '@/types/maintenance';
import type {
  MaintenanceCompleteInput,
  MaintenanceCreateInput,
  MaintenanceStatusInput,
  MaintenanceUpdateInput,
} from '@/lib/schemas/maintenance';
import { cheminApi } from '@/lib/chemin-api';

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
  'accepted_at',
  'created_at',
] as const;

const DETAIL_FIELDS = [
  ...LIST_FIELDS,
  'description',
  'estimated_cost',
  'started_at',
  'resolution_notes',
  'quote_amount',
  'quote_currency',
  'quote_submitted_at',
  'quote_decision_at',
  'quote_decision_by_id',
  'quote_rejection_reason',
  'quote_lines',
  'quote_valid_until',
  'quote_estimated_duration_days',
  'access_instructions',
] as const;

const PROPERTY_FIELDS = ['id', 'title', 'slug'] as const;

/** TCK-592 (P17) — `agency_id` : sans lui, l'agence du bien ne se charge pas dans la liste. */
const LIST_PROPERTY_FIELDS = [...PROPERTY_FIELDS, 'agency_id'] as const;

const USER_FIELDS = ['id', 'first_name', 'last_name', 'username', 'email'] as const;

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
    fields: { maintenance_requests: [...fields], properties: [...LIST_PROPERTY_FIELDS] },
    filter: Object.keys(filter).length ? filter : undefined,
    // TCK-592 (P17) — le bien (quartier) et son agence : « Mes interventions » les nomme.
    include: ['property'],
    sort: params?.sort ?? '-created_at',
    page: params?.page,
    per_page: params?.per_page ?? 20,
  };
}

/**
 * TCK-592 (P14) — la liste dit si « Nouvelle demande » mène quelque part : le prestataire prenait
 * un 403 en la suivant.
 */
export type MaintenanceListResponse = PaginatedResponse<MaintenanceRequest> & {
  readonly meta: PaginatedResponse<MaintenanceRequest>['meta'] & {
    readonly abilities?: { readonly can_create: boolean };
  };
};

/** `GET /api/maintenance-requests` (visible-to-user scope + spatie filters). */
export function useMaintenanceRequests(params?: MaintenanceListParams) {
  return useApiQuery<MaintenanceListResponse>(
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
    cheminApi`/api/properties/${propertyId}/maintenance-requests`,
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
    cheminApi`/api/maintenance-requests/${id}`,
    {
      params: {
        fields: {
          maintenance_requests: [...DETAIL_FIELDS],
          properties: [...PROPERTY_FIELDS],
          users: [...USER_FIELDS],
        },
        include: ['property', 'requester', 'assignee', 'quoteDecisionBy'],
      },
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

/**
 * `PATCH /api/maintenance-requests/{id}` — assigner, planifier, chiffrer. Un changement de
 * `assigned_to` passe par `MaintenanceRequestService::assign()` (acceptation remise à zéro).
 */
export function useUpdateMaintenanceRequest(id: number) {
  return useApiMutation<ApiResponse<MaintenanceRequest>, Partial<MaintenanceUpdateInput>>(
    { path: cheminApi`/api/maintenance-requests/${id}`, method: 'PATCH' },
    {
      invalidate: [maintenanceKeys.all, maintenanceKeys.detail(id)],
    },
  );
}

/** `PUT /api/maintenance-requests/{id}/status` — validated transition. */
export function useTransitionMaintenanceStatus(id: number) {
  return useApiMutation<ApiResponse<MaintenanceRequest>, MaintenanceStatusInput>(
    { path: cheminApi`/api/maintenance-requests/${id}/status`, method: 'PUT' },
    {
      invalidate: [maintenanceKeys.all, maintenanceKeys.detail(id)],
    },
  );
}

/**
 * `PUT /api/maintenance-requests/{id}/complete` — rapport, coût et photos de fin dans LA MÊME
 * requête (TCK-592, P15). Elles partaient après la transition, et leur échec était avalé.
 *
 * Multipart en `POST` + `_method=PUT` : PHP ne lit pas un corps multipart sur `PUT`, et Laravel
 * rejoue la méthode depuis `_method`.
 */
export type MaintenanceCompleteVariables = MaintenanceCompleteInput & {
  readonly photos?: readonly File[];
};

export function useCompleteMaintenanceRequest(id: number) {
  return useApiMutation<ApiResponse<MaintenanceRequest>, MaintenanceCompleteVariables>(
    {
      path: cheminApi`/api/maintenance-requests/${id}/complete`,
      method: 'POST',
      formData: true,
      body: ({ resolution_notes, actual_cost, photos }) => {
        const fd = new FormData();
        fd.append('_method', 'PUT');
        if (resolution_notes) fd.append('resolution_notes', resolution_notes);
        if (actual_cost !== undefined) fd.append('actual_cost', String(actual_cost));
        for (const photo of photos ?? []) fd.append('photos[]', photo);
        return fd;
      },
    },
    {
      invalidate: [maintenanceKeys.all, maintenanceKeys.detail(id)],
    },
  );
}

/** TCK-592 — le prestataire assigné accepte l'intervention. */
export function useAcceptMaintenance(id: number) {
  return useApiMutation<ApiResponse<MaintenanceRequest>, void>(
    { path: cheminApi`/api/maintenance-requests/${id}/accept`, method: 'POST' },
    { invalidate: [maintenanceKeys.all, maintenanceKeys.detail(id)] },
  );
}

/** TCK-592 — … ou la refuse, motif à l'appui : elle revient au donneur d'ordre. */
export function useDeclineMaintenance(id: number) {
  return useApiMutation<ApiResponse<MaintenanceRequest>, { reason: string }>(
    { path: cheminApi`/api/maintenance-requests/${id}/decline`, method: 'POST' },
    { invalidate: [maintenanceKeys.all, maintenanceKeys.detail(id)] },
  );
}

/** TCK-592 (P10) — « C'est réparé ». */
export function useConfirmMaintenanceResolution(id: number) {
  return useApiMutation<ApiResponse<MaintenanceRequest>, void>(
    { path: cheminApi`/api/maintenance-requests/${id}/confirm-resolution`, method: 'POST' },
    { invalidate: [maintenanceKeys.all, maintenanceKeys.detail(id)] },
  );
}

/** TCK-592 (P10) — « Le problème persiste » : commentaire, photos facultatives. */
export function useContestMaintenanceResolution(id: number) {
  return useApiMutation<
    ApiResponse<MaintenanceRequest>,
    { comment: string; photos?: readonly File[] }
  >(
    {
      path: cheminApi`/api/maintenance-requests/${id}/contest-resolution`,
      method: 'POST',
      formData: true,
      body: ({ comment, photos }) => {
        const fd = new FormData();
        fd.append('comment', comment);
        for (const photo of photos ?? []) fd.append('photos[]', photo);
        return fd;
      },
    },
    { invalidate: [maintenanceKeys.all, maintenanceKeys.detail(id)] },
  );
}

/**
 * TCK-592 — le carnet de l'agence, pour le bloc « Prestataire et créneau » : les collaborations
 * ACTIVES seulement (`filter[collaboration_status]`, défaut de l'API rendu explicite), du métier de
 * la demande quand il est connu.
 */
export function useAssignableProviders(agencyId: number | null, specialty?: string) {
  return useApiQuery<PaginatedResponse<ServiceProviderProfileSummary>>(
    ['maintenance', 'assignable-providers', agencyId ?? 0, specialty ?? ''],
    cheminApi`/api/agencies/${agencyId}/service-providers`,
    {
      params: {
        fields: { service_provider_profiles: [...SERVICE_PROVIDER_PROFILE_FIELDS] },
        include: ['user'],
        filter: {
          collaboration_status: 'active',
          status: 'active',
          ...(specialty ? { specialty } : {}),
        },
        sort: '-created_at',
        per_page: 50,
      },
      enabled: agencyId !== null && agencyId > 0,
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
  readonly collection?: 'photos' | 'completion_photos' | 'before_photos';
}

export function useUploadMaintenancePhotos() {
  return useApiMutation<unknown, UploadMaintenancePhotosInput>(
    {
      path: ({ id }) => cheminApi`/api/maintenance-requests/${id}/photos`,
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

export function useRequestMaintenanceQuote(id: number) {
  return useApiMutation<ApiResponse<MaintenanceRequest>, void>(
    { path: cheminApi`/api/maintenance-requests/${id}/quote/request`, method: 'POST' },
    { invalidate: [maintenanceKeys.all, maintenanceKeys.detail(id)] },
  );
}

/**
 * TCK-592 (P12) — un devis est une liste de lignes : le montant est CALCULÉ par l'API, et
 * `amount` / `currency` y sont refusés (422).
 */
export interface MaintenanceQuoteLineInput {
  readonly label: string;
  readonly kind: MaintenanceQuoteLineKind;
  readonly quantity: number;
  readonly unit_price: number;
}

export interface SubmitMaintenanceQuoteInput {
  readonly lines: readonly MaintenanceQuoteLineInput[];
  readonly valid_until: string;
  readonly estimated_duration_days?: number | null;
  readonly attachments?: readonly File[];
}

export function useSubmitMaintenanceQuote(id: number) {
  return useApiMutation<ApiResponse<MaintenanceRequest>, SubmitMaintenanceQuoteInput>(
    {
      path: cheminApi`/api/maintenance-requests/${id}/quote/submit`,
      method: 'POST',
      formData: true,
      body: (vars) => {
        const fd = new FormData();
        vars.lines.forEach((line, i) => {
          fd.append(`lines[${i}][label]`, line.label);
          fd.append(`lines[${i}][kind]`, line.kind);
          fd.append(`lines[${i}][quantity]`, String(line.quantity));
          fd.append(`lines[${i}][unit_price]`, String(line.unit_price));
        });
        fd.append('valid_until', vars.valid_until);
        if (vars.estimated_duration_days) {
          fd.append('estimated_duration_days', String(vars.estimated_duration_days));
        }
        for (const file of vars.attachments ?? []) fd.append('attachments[]', file);
        return fd;
      },
    },
    { invalidate: [maintenanceKeys.all, maintenanceKeys.detail(id)] },
  );
}

export function useApproveMaintenanceQuote(id: number) {
  return useApiMutation<ApiResponse<MaintenanceRequest>, void>(
    { path: cheminApi`/api/maintenance-requests/${id}/quote/approve`, method: 'POST' },
    { invalidate: [maintenanceKeys.all, maintenanceKeys.detail(id)] },
  );
}

export function useRejectMaintenanceQuote(id: number) {
  return useApiMutation<ApiResponse<MaintenanceRequest>, { reason: string }>(
    { path: cheminApi`/api/maintenance-requests/${id}/quote/reject`, method: 'POST' },
    { invalidate: [maintenanceKeys.all, maintenanceKeys.detail(id)] },
  );
}

export function useStartMaintenance(id: number) {
  return useApiMutation<ApiResponse<MaintenanceRequest>, void>(
    { path: cheminApi`/api/maintenance-requests/${id}/start`, method: 'POST' },
    { invalidate: [maintenanceKeys.all, maintenanceKeys.detail(id)] },
  );
}
