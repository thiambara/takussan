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
import type { PropertyDetail, PropertyListItem } from '@/types/property';

/** Columns the agent CRUD list view actually renders — keep this narrow. */
// `main_photo_url` is a computed attribute exposed by PropertyResource (via
// media library), not a real DB column — don't request it via fields[properties]
// or spatie/laravel-query-builder rejects with InvalidFieldQuery (HTTP 400).
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
  'published_at',
  'created_at',
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

/** Columns needed by the edit form. */
export const DASHBOARD_PROPERTY_DETAIL_FIELDS = [
  ...DASHBOARD_PROPERTY_FIELDS,
  'description',
  'bathrooms',
  'furnished',
  'rent_period',
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
