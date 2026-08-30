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
/**
 * TCK-470 — le corps part IMBRIQUÉ, et le type le dit désormais. `PropertyFormPayload` (plat,
 * `city` au premier niveau) n'est PAS ce que ces deux fonctions envoient : c'est l'entrée de
 * `payload.ts`, pas sa sortie.
 */
import type {
  PropertyCreatePayload,
  PropertyUpdatePayload,
} from '@/components/property-form/payload';

/**
 * Colonnes que la liste CRUD agent rend réellement — la garder étroite.
 *
 * ⚠ Cette liste ne couvre PAS tout ce que `PropertyList` affiche, et c'est délibéré :
 * `location` et `main_photo_url` sont des attributs **calculés** (adresse jointe, media
 * library), pas des colonnes. Spatie ne valide `fields[]` que contre
 * `Property::$queryFields` et refuse tout le reste — mesuré le 2026-08-21 :
 *
 *     GET /api/properties?fields[properties]=id,title,main_photo_url  → 400 InvalidFieldQuery
 *     GET /api/properties?fields[properties]=id,title,location        → 400 InvalidFieldQuery
 *     GET /api/properties?fields[properties]=id,title                 → 200
 *
 * Le contrat de TCK-336 est donc à deux ensembles disjoints : ce qui se DEMANDE ici, et ce
 * que `PropertyResource` sert INCONDITIONNELLEMENT. Le second est écrit, avec sa garde, dans
 * `__tests__/property-fields.coverage.test.ts` — ne pas le déduire de ce commentaire.
 *
 * ⚠⚠ `user_id` est demandé alors qu'AUCUN composant ne le lit, et il ne s'agit pas d'un
 * oubli — même raison que `agency_id` dans `ADMIN_PROPERTY_FIELDS` : Eloquent a besoin de
 * la clé étrangère sur chaque ligne parente pour résoudre `include=owner`
 * (`belongsTo(User::class)`). Le retirer rendrait `property.owner` nul partout, sans erreur
 * TypeScript ni test rouge — mesuré : la ressource n'émet même pas `user_id`, donc le
 * supprimer ne se voit dans aucune réponse, seulement dans la disparition de `owner`.
 */
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
  'rent_period',
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

/**
 * Colonnes dont le formulaire d'édition a besoin, en plus de celles de la liste.
 *
 * ⚠ `views_count` et `favorites_count` y figuraient une SECONDE fois : le spread
 * `...DASHBOARD_PROPERTY_FIELDS` les apporte déjà, et la chaîne partait avec le doublon.
 * Sans effet côté serveur, mais une liste qui se répète est une liste que personne ne relit.
 *
 * ⚠⚠ `description` n'est PAS dans `Property::$queryFields`. Ça tient uniquement parce que
 * cette liste ne sert que la route SHOW, qui n'instancie pas `QueryBuilder` et ne valide donc
 * pas `fields[]` — mesuré le 2026-08-21 :
 *
 *     GET /api/properties/131?fields[properties]=…,description  → 200
 *     GET /api/properties?fields[properties]=id,title,description → 400 InvalidFieldQuery
 *
 * La retirer serait pire que la laisser : sous TCK-336 la ressource filtre sur les clés
 * demandées, et le formulaire d'édition perdrait la description. Réemployer cette liste sur
 * une route index rendrait en revanche 400 — `property-fields.coverage.test.ts` porte
 * l'exemption nommément, pour qu'elle soit un choix et non un oubli.
 */
export const DASHBOARD_PROPERTY_DETAIL_FIELDS = [
  ...DASHBOARD_PROPERTY_FIELDS,
  'description',
  'bathrooms',
  'furnished',
  'title_type',
  'floor_number',
  'total_floors',
  'available_from',
  'year_built',
  'parking_spaces',
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
  payload: PropertyCreatePayload,
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
  payload: PropertyUpdatePayload,
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
  /** TCK-356 — même clé que l'API publique : la plus grande conversion servie. */
  readonly full: string;
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
