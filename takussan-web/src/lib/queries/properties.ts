import { apiRequest, buildQueryString } from '@/lib/api';
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

/**
 * Property queries — TCK-041 dashboard agent CRUD.
 *
 * ALL list/detail fetches go through `spatie/laravel-query-builder` conventions
 * (fields[], filter[], include, sort). See CLAUDE.md → API — Conventions
 * frontend.
 */

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

export async function uploadPropertyPhotos(
  token: string,
  propertyId: number,
  files: File[],
): Promise<void> {
  const form = new FormData();
  for (const file of files) {
    form.append('photos[]', file);
  }
  await apiRequest<void>(`/api/properties/${propertyId}/photos`, {
    method: 'POST',
    body: form,
    token,
    formData: true,
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
