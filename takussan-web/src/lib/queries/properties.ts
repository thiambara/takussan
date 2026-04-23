/**
 * Property queries — combined module.
 *
 * This file exposes two distinct surfaces that intentionally co-exist:
 *
 * 1. **Dashboard / agent CRUD** (TCK-041): plain async functions built on
 *    `apiRequest` that take an explicit `token`. Used by the agent-facing
 *    dashboard list, edit form, status/visibility toggles, photo upload,
 *    and price-history viewer. Hits `/api/properties/*`.
 *
 * 2. **Public discovery (Wave 3)**: React-Query hooks built on
 *    `useApiQuery`. Used by the homepage, search results, and map.
 *    Hits `/api/public/properties/*`. Co-exists with the legacy
 *    `useProperties` / `useSearch` reducer hooks — callers migrate
 *    progressively when sparse fieldsets or cache sharing matter.
 *
 * ALL list/detail fetches follow `spatie/laravel-query-builder` conventions
 * (fields[], filter[], include, sort). See CLAUDE.md → "API — Conventions
 * frontend" and `docs/spatie-query-builder.md`.
 */

'use client';

import { apiRequest, buildQueryString } from '@/lib/api';
import { useApiQuery } from '@/hooks/useApiQuery';
import type {
  PaginatedResponse,
  ApiResponse,
  SpatieQueryParams,
} from '@/types/api';
import type {
  PropertyListItem,
  PropertyDetail,
  PropertyPriceHistoryItem,
} from '@/types/property';
import type { PropertyFormPayload } from '@/lib/schemas/property';

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard (agent CRUD) — TCK-041
// ─────────────────────────────────────────────────────────────────────────────

/** Columns the agent CRUD list view actually renders — keep this narrow. */
export const DASHBOARD_PROPERTY_FIELDS = [
  'id',
  'reference_number',
  'title',
  'slug',
  'price',
  'currency',
  'type',
  'contract_type',
  'status',
  'visibility',
  'bedrooms',
  'area',
  'main_photo_url',
  'published_at',
  'created_at',
] as const;

/** Columns needed by the edit form. */
export const DASHBOARD_PROPERTY_DETAIL_FIELDS = [
  ...DASHBOARD_PROPERTY_FIELDS,
  'description',
  'bathrooms',
  'furnished',
  'rent_period',
] as const;

export interface DashboardPropertyFilters {
  readonly status?: string;
  readonly type?: string;
  readonly contract_type?: string;
  readonly search?: string;
}

export interface FetchDashboardPropertiesParams {
  readonly page?: number;
  readonly perPage?: number;
  readonly sort?: string;
  readonly filters?: DashboardPropertyFilters;
}

function buildListParams({
  page,
  perPage,
  sort,
  filters,
}: FetchDashboardPropertiesParams): SpatieQueryParams {
  const filter: Record<string, string> = {};
  if (filters?.status) filter.status = filters.status;
  if (filters?.type) filter.type = filters.type;
  if (filters?.contract_type) filter.contract_type = filters.contract_type;
  if (filters?.search) filter.search = filters.search;

  return {
    fields: { properties: DASHBOARD_PROPERTY_FIELDS },
    filter,
    sort: sort ?? '-created_at',
    page: page ?? 1,
    per_page: perPage ?? 20,
  };
}

export async function fetchDashboardProperties(
  token: string,
  params: FetchDashboardPropertiesParams = {},
): Promise<PaginatedResponse<PropertyListItem>> {
  const qs = buildQueryString(buildListParams(params));
  return apiRequest<PaginatedResponse<PropertyListItem>>(
    `/api/properties${qs ? `?${qs}` : ''}`,
    { token },
  );
}

export async function fetchDashboardProperty(
  token: string,
  idOrSlug: string | number,
): Promise<PropertyDetail> {
  const qs = buildQueryString({
    fields: { properties: DASHBOARD_PROPERTY_DETAIL_FIELDS },
  });
  const res = await apiRequest<ApiResponse<PropertyDetail>>(
    `/api/properties/${idOrSlug}${qs ? `?${qs}` : ''}`,
    { token },
  );
  return res.data;
}

export async function createProperty(
  token: string,
  payload: PropertyFormPayload,
): Promise<PropertyDetail> {
  const res = await apiRequest<ApiResponse<PropertyDetail>>('/api/properties', {
    method: 'POST',
    body: payload,
    token,
  });
  return res.data;
}

export async function updateProperty(
  token: string,
  propertyId: number,
  payload: PropertyFormPayload,
): Promise<PropertyDetail> {
  const res = await apiRequest<ApiResponse<PropertyDetail>>(
    `/api/properties/${propertyId}`,
    {
      method: 'PUT',
      body: payload,
      token,
    },
  );
  return res.data;
}

export async function deleteProperty(
  token: string,
  propertyId: number,
): Promise<void> {
  await apiRequest<void>(`/api/properties/${propertyId}`, {
    method: 'DELETE',
    token,
  });
}

export async function updatePropertyStatus(
  token: string,
  propertyId: number,
  status: string,
): Promise<PropertyDetail> {
  const res = await apiRequest<ApiResponse<PropertyDetail>>(
    `/api/properties/${propertyId}/status`,
    {
      method: 'PUT',
      body: { status },
      token,
    },
  );
  return res.data;
}

export async function updatePropertyVisibility(
  token: string,
  propertyId: number,
  visibility: 'public' | 'private',
): Promise<PropertyDetail> {
  const res = await apiRequest<ApiResponse<PropertyDetail>>(
    `/api/properties/${propertyId}/visibility`,
    {
      method: 'PUT',
      body: { visibility },
      token,
    },
  );
  return res.data;
}

/**
 * TCK-071 — upload one or more photos to a property's `photos` media
 * collection. The backend route is `POST /api/properties/:id/media`
 * (see `PropertyMediaController::store`), expecting a `photos[]` array.
 */
export async function uploadPropertyPhotos(
  token: string,
  propertyId: number,
  files: File[],
): Promise<void> {
  const form = new FormData();
  for (const file of files) {
    form.append('photos[]', file);
  }
  await apiRequest<void>(`/api/properties/${propertyId}/media`, {
    method: 'POST',
    body: form,
    token,
    formData: true,
  });
}

/**
 * TCK-071 — one Media entry as exposed by `PropertyMediaController::index`.
 */
export interface PropertyMediaItem {
  readonly id: number;
  readonly thumbnail: string;
  readonly preview: string;
  readonly original: string;
  readonly order: number | null;
}

/**
 * TCK-071 — fetch the current photo list (cover = item at position 0).
 */
export async function fetchPropertyMedia(
  token: string,
  propertyId: number,
): Promise<PropertyMediaItem[]> {
  const res = await apiRequest<ApiResponse<PropertyMediaItem[]>>(
    `/api/properties/${propertyId}/media`,
    { token },
  );
  return res.data;
}

/**
 * TCK-071 — delete a single media item. Backend: `DELETE
 * /api/properties/:id/media/:mediaId`.
 */
export async function deletePropertyMedia(
  token: string,
  propertyId: number,
  mediaId: number,
): Promise<void> {
  await apiRequest<void>(`/api/properties/${propertyId}/media/${mediaId}`, {
    method: 'DELETE',
    token,
  });
}

/**
 * TCK-071 — persist a new order for the `photos` collection. The backend
 * uses `PropertyMediaController::reorder` which expects a body of the
 * shape `{ order: number[] }` where the array position becomes the new
 * `order_column`. The first id is therefore the cover photo.
 */
export async function reorderPropertyMedia(
  token: string,
  propertyId: number,
  mediaIds: number[],
): Promise<void> {
  await apiRequest<void>(`/api/properties/${propertyId}/media/reorder`, {
    method: 'PUT',
    body: { order: mediaIds },
    token,
  });
}

export async function fetchPropertyPriceHistory(
  token: string,
  propertyId: number,
): Promise<PropertyPriceHistoryItem[]> {
  const res = await apiRequest<ApiResponse<PropertyPriceHistoryItem[]>>(
    `/api/properties/${propertyId}/price-history`,
    { token },
  );
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public discovery (Wave 3) — React Query hooks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default sparse fieldset for property cards. Keep in sync with
 * {@link PropertyListItem} — only list columns the cards actually render.
 */
export const PROPERTY_CARD_FIELDS = [
  'id',
  'reference_number',
  'title',
  'slug',
  'price',
  'currency',
  'type',
  'contract_type',
  'rent_period',
  'area',
  'bedrooms',
  'bathrooms',
  'featured',
  'published_at',
  'created_at',
] as const;

export const propertiesQueryKeys = {
  all: ['properties'] as const,
  list: (params: SpatieQueryParams | undefined) =>
    ['properties', 'list', params ?? {}] as const,
  map: (bounds: string, filters: Record<string, string | undefined>) =>
    ['properties', 'map', bounds, filters] as const,
};

/**
 * Fetch a paginated list of public properties.
 *
 * @example
 * usePublicPropertiesQuery({
 *   filter: { featured: true },
 *   include: ['address', 'media'],
 *   fields: { properties: PROPERTY_CARD_FIELDS },
 *   per_page: 12,
 * });
 */
export function usePublicPropertiesQuery(
  params: SpatieQueryParams & { enabled?: boolean } = {},
) {
  const { enabled, ...query } = params;
  return useApiQuery<PaginatedResponse<PropertyListItem>>(
    propertiesQueryKeys.list(query),
    '/api/public/properties',
    { params: query, enabled },
  );
}

// ── Map (GeoJSON) ────────────────────────────────────────────────────────────

export type PropertyMapFeature = {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    id: number;
    slug: string;
    title: string;
    price: number;
    currency: string | null;
    type: string | null;
    contract_type: string | null;
    thumbnail: string | null;
  };
};

export type PropertyMapResponse = {
  type: 'FeatureCollection';
  features: PropertyMapFeature[];
  meta: { limit: number; returned: number; truncated: boolean };
};

export type MapBounds = {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
};

export function boundsToString(b: MapBounds): string {
  return [b.swLat, b.swLng, b.neLat, b.neLng]
    .map((v) => v.toFixed(6))
    .join(',');
}

/**
 * Fetch clustered markers inside geographic bounds. Accepts the same filter
 * subset as `GET /api/public/properties/map` (type, contract_type, price).
 */
export function usePropertyMapQuery(
  bounds: MapBounds | null,
  extraFilters: Record<string, string | number | undefined> = {},
  options: { enabled?: boolean } = {},
) {
  const boundsStr = bounds ? boundsToString(bounds) : '';
  const filters = Object.fromEntries(
    Object.entries(extraFilters).filter(
      ([, value]) => value !== undefined && value !== '' && value !== null,
    ),
  ) as Record<string, string | number>;

  return useApiQuery<PropertyMapResponse>(
    propertiesQueryKeys.map(
      boundsStr,
      Object.fromEntries(
        Object.entries(filters).map(([k, v]) => [k, String(v)]),
      ),
    ),
    '/api/public/properties/map',
    {
      enabled: options.enabled !== false && Boolean(bounds),
      params: { extra: { bounds: boundsStr, ...filters } },
      staleTime: 30 * 1000,
    },
  );
}