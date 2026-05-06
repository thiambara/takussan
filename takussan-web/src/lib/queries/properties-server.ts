/**
 * Server-safe property queries — dashboard CRUD surface.
 *
 * No `'use client'` directive: these are plain async functions that take an
 * explicit token and can be called from Server Components or Server Actions.
 *
 * React Query hooks for public discovery live in `properties.ts` (which has
 * `'use client'` and re-exports everything from this file for backward compat).
 */

import { apiRequest, buildQueryString } from '@/lib/api';
import type {
  ApiResponse,
  PaginatedResponse,
  SpatieQueryParams,
} from '@/types/api';
import type {
  PropertyDetail,
  PropertyListItem,
  PropertyPriceHistoryItem,
} from '@/types/property';
import type { PropertyFormPayload } from '@/lib/schemas/property';

/** Columns the agent CRUD list view actually renders — keep this narrow. */
// `main_photo_url` is a computed attribute exposed by PropertyResource (via
// media library), not a real DB column — don't request it via fields[properties]
// or spatie/laravel-query-builder rejects with InvalidFieldQuery (HTTP 400).
export const DASHBOARD_PROPERTY_FIELDS = [
  'id',
  'user_id',
  'reference_number',
  'title',
  'slug',
  'price',
  'currency',
  'type',
  'contract_type',
  'status',
  'visibility',
  'views_count',
  'favorites_count',
  'bedrooms',
  'area',
  'published_at',
  'created_at',
] as const;

export interface DashboardPropertyFilters {
  readonly status?: string;
  readonly type?: string;
  readonly contract_type?: string;
  readonly visibility?: string;
  readonly search?: string;
  readonly city?: string;
  readonly user_id?: string;
  readonly price_min?: string;
  readonly price_max?: string;
  readonly created_from?: string;
  readonly created_to?: string;
  readonly include_archived?: string;
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
  if (filters?.visibility) filter.visibility = filters.visibility;
  if (filters?.search) filter.search = filters.search;
  if (filters?.city) filter.city = filters.city;
  if (filters?.user_id) filter.user_id = filters.user_id;
  if (filters?.price_min) filter.price_min = filters.price_min;
  if (filters?.price_max) filter.price_max = filters.price_max;
  if (filters?.created_from) filter.created_from = filters.created_from;
  if (filters?.created_to) filter.created_to = filters.created_to;

  return {
    fields: { properties: DASHBOARD_PROPERTY_FIELDS },
    filter,
    include: ['address', 'owner', 'collaborators'],
    sort: sort ?? '-created_at',
    page: page ?? 1,
    per_page: perPage ?? 20,
    extra: filters?.include_archived === '1' ? { include_archived: '1' } : undefined,
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

/** Columns needed by the edit form. */
export const DASHBOARD_PROPERTY_DETAIL_FIELDS = [
  ...DASHBOARD_PROPERTY_FIELDS,
  'description',
  'bathrooms',
  'furnished',
  'rent_period',
  'title_type',
  'floor_number',
  'total_floors',
  'year_built',
  'parking_spaces',
  'views_count',
  'favorites_count',
] as const;

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

export async function duplicateProperty(
  token: string,
  propertyId: number,
): Promise<PropertyDetail> {
  const res = await apiRequest<ApiResponse<PropertyDetail>>(
    `/api/properties/${propertyId}/duplicate`,
    {
      method: 'POST',
      body: {},
      token,
    },
  );
  return res.data;
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

export async function assignPropertyAgent(
  token: string,
  propertyId: number,
  userId: number,
): Promise<PropertyDetail> {
  const res = await apiRequest<ApiResponse<PropertyDetail>>(
    `/api/properties/${propertyId}/assigned-agent`,
    {
      method: 'PUT',
      body: { user_id: userId },
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

export interface PropertyAddressPayload {
  readonly street?: string;
  readonly neighborhood?: string;
  readonly city?: string;
  readonly region?: string;
  readonly country?: string;
  readonly postal_code?: string;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
}

export async function setPropertyAddress(
  token: string,
  propertyId: number,
  data: PropertyAddressPayload,
): Promise<void> {
  await apiRequest<unknown>(`/api/properties/${propertyId}/address`, {
    method: 'PUT',
    body: data,
    token,
  });
}

export async function setPropertyTags(
  token: string,
  propertyId: number,
  tagIds: number[],
): Promise<void> {
  await apiRequest<unknown>(`/api/properties/${propertyId}/tags`, {
    method: 'POST',
    body: { tag_ids: tagIds },
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
