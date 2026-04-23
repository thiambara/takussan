/**
 * React-Query hooks for the public properties endpoints.
 *
 * These are **additive** helpers used by Wave 3 discovery surfaces
 * (homepage, search results, map). They co-exist with the legacy
 * `useProperties` / `useSearch` reducer hooks introduced earlier —
 * callers progressively migrate to these when sparse fieldsets
 * matter or when cache sharing with mutations is desirable.
 *
 * Conventions (see CLAUDE.md → "API — Conventions frontend") :
 * - Always pass `fields[properties]=...` to keep payloads lean.
 * - Always use `include=` for address / media rather than a second
 *   round-trip.
 * - Filters go through `filter[...]`; see `docs/spatie-query-builder.md`.
 */

'use client';

import { useApiQuery } from '@/hooks/useApiQuery';
import type { PaginatedResponse, SpatieQueryParams } from '@/types/api';
import type { PropertyListItem } from '@/types/property';

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
