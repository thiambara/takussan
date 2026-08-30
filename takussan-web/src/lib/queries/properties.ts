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
import type { PropertyListItem } from '@/types/property';

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard (agent CRUD) — TCK-041
// Re-exported from properties-server.ts (server-safe, no 'use client') so that
// both Server Components/Actions and this client module can share the same
// symbols. Marking this file 'use client' turned every direct export into a
// client reference, breaking server-side calls from app/actions/* — hence the
// move into the server-safe sibling.
// ─────────────────────────────────────────────────────────────────────────────
export type {
  DashboardPropertyFilters,
  FetchDashboardPropertiesParams,
  PropertyMediaItem,
} from './properties-server';
export {
  DASHBOARD_PROPERTY_FIELDS,
  DASHBOARD_PROPERTY_DETAIL_FIELDS,
  fetchDashboardProperties,
  fetchDashboardProperty,
  createProperty,
  updateProperty,
  deleteProperty,
  updatePropertyStatus,
  updatePropertyVisibility,
  assignPropertyAgent,
  uploadPropertyPhotos,
  fetchPropertyMedia,
  deletePropertyMedia,
  reorderPropertyMedia,
  setPropertyTags,
  fetchPropertyPriceHistory,
} from './properties-server';

// ─────────────────────────────────────────────────────────────────────────────
// Public discovery (Wave 3) — React Query hooks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default sparse fieldset for property cards. Keep in sync with
 * {@link PropertyListItem} — only list columns the cards actually render.
 *
 * ⚠ TCK-336 — MESURÉ le 2026-08-21 : cette constante et `usePublicPropertiesQuery`
 * ci-dessous n'ont **aucun appelant** dans `src/` (`grep -rn PROPERTY_CARD_FIELDS src/` →
 * la déclaration et son propre exemple JSDoc ; `grep -rn usePublicPropertiesQuery src/` →
 * la seule déclaration). La découverte publique passe par
 * `/api/public/properties/search`, qui n'honore pas `fields[]`. Elle n'est donc PAS
 * couverte par `__tests__/property-fields.coverage.test.ts` : on ne peut pas dériver les
 * clés lues d'un consommateur qui n'existe pas.
 *
 * Le jour où on la branche, l'ajouter comme appelant dans cette garde AVANT de livrer —
 * sinon la liste est décidée par ce commentaire, et un commentaire ne casse pas la CI.
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
