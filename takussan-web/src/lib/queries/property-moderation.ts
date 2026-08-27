import { apiRequest, buildQueryString } from '@/lib/api';
import type { PaginatedResponse, ApiResponse } from '@/types/api';

/**
 * Property moderation queries — TCK-098.
 * Admin queue uses filter[search] and per_page.
 */

export interface ModerationPropertyOwner {
  id: number;
  name: string;
  avatar_url: string | null;
}

export interface ModerationPropertyAgency {
  id: number;
  name: string;
}

export interface ModerationProperty {
  id: number;
  reference_number: string;
  title: string;
  slug: string;
  status: string;
  main_photo_url: string | null;
  price: number;
  currency: string | null;
  type: string;
  submitted_at: string | null;
  rejection_reason: string | null;
  owner: ModerationPropertyOwner | null;
  agency: ModerationPropertyAgency | null;
  location: {
    city: string | null;
    region: string | null;
    country: string | null;
  };
}

export interface ModerationQueueMeta {
  total: number;
  current_page: number;
  last_page: number;
  per_page: number;
  pending_count: number;
}

export type ModerationPropertyQueueResponse = PaginatedResponse<ModerationProperty> & {
  meta: ModerationQueueMeta;
};

export interface FetchPropertyModerationQueueParams {
  readonly search?: string;
  readonly page?: number;
  readonly perPage?: number;
}

/**
 * Les colonnes que la file de modération lit, et AUCUNE autre.
 *
 * Relevé sur les trois consommateurs (`PropertyModerationQueueList`,
 * `PropertyModerationDetail`, et le compte de `agency-queues.ts`) : dix colonnes de vue plus
 * deux clés étrangères.
 *
 * ⚠ **`user_id` et `agency_id` ne sont pas décoratifs.** `Property::owner()` est un
 * `belongsTo(User::class, 'user_id')` et `agency()` porte sur `agency_id` : un `fields[]` qui
 * omet une clé étrangère rend la relation d'`include=` **nulle** au lieu de la rendre absente —
 * l'écran affiche alors « propriétaire inconnu » sur un bien qui en a un. C'est la même famille
 * de piège que `whenHas` côté `PropertyResource` (TCK-336) : *une clé absente se remarque, une
 * clé fausse se croit.*
 *
 * ⚠ `main_photo_url` et `location` n'y figurent PAS et ne le peuvent pas : ce sont des clés
 * DÉRIVÉES (média, relation `address`), pas des colonnes — spatie rend 400 `InvalidFieldQuery`
 * sur une clé qui n'est pas une colonne. Elles arrivent par `include=` et par la résolution de
 * média du resource.
 */
export const MODERATION_PROPERTY_FIELDS = [
  'id',
  'reference_number',
  'title',
  'slug',
  'status',
  'type',
  'price',
  'currency',
  'submitted_at',
  'rejection_reason',
  'user_id',
  'agency_id',
] as const;

/** Les relations que la file rend : l'auteur, l'agence, et la ville de `location`. */
export const MODERATION_PROPERTY_INCLUDES = ['owner', 'agency', 'address'] as const;

/**
 * Le tri de la file : **du plus ancien soumis au plus récent**. Une file d'attente se traite par
 * le bout qui attend depuis le plus longtemps.
 */
export const MODERATION_PROPERTY_SORT = 'submitted_at';

/**
 * La file de modération des biens — TCK-098, remise sous discipline « sparse fieldsets » par la
 * revue de TCK-375.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE REQUÊTE NOMME SES COLONNES, ET CE QUE ÇA NE FAIT PAS ENCORE
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * CLAUDE.md § « Sparse fieldsets obligatoires » : *toute lecture depuis le front passe
 * `fields[table]=…` avec les seules colonnes de la vue, charge ses relations par `include=` et
 * trie côté serveur.* Ce fetcher ne le faisait pas — et depuis TCK-375 il est aussi le SONDAGE
 * DE 60 s qui alimente le compte de deux écrans (`fetchPropertyModerationCount`), ce qui a
 * transformé un écart de forme en trafic périodique.
 *
 * ⚠ **Mesuré le 2026-08-27, et il faut le dire ici plutôt que le laisser croire : côté serveur,
 * ces trois paramètres sont aujourd'hui INERTES.**
 * `PropertyModerationController::index()` construit sa requête avec `Property::query()
 * ->with(['owner','agency','address'])->orderBy('submitted_at')` — le builder NU, pas
 * `Property::buildQuery()` (`HasQueryBuilder`). Spatie n'est donc jamais instancié sur cette
 * route : `fields[properties]`, `include` et `sort` y sont des paramètres non lus, ni honorés ni
 * rejetés. **La charge utile ne diminue pas tant que la route n'est pas portée sur
 * `buildQuery()`** ; c'est un delta d'API, hors du périmètre de ce correctif.
 *
 * Ce que ce fetcher gagne quand même, et pourquoi il est écrit maintenant : la requête DÉCLARE
 * ce que l'écran lit. Le jour où la route bascule, rien ne bouge ici — et surtout, les colonnes
 * ont été relevées pendant qu'on avait les trois consommateurs sous les yeux. *Une liste de
 * colonnes écrite au moment de la bascule est une liste devinée.*
 */
export async function fetchPropertyModerationQueue(
  token: string,
  params: FetchPropertyModerationQueueParams = {},
): Promise<ModerationPropertyQueueResponse> {
  const qs = buildQueryString({
    fields: { properties: [...MODERATION_PROPERTY_FIELDS] },
    filter: { search: params.search },
    include: [...MODERATION_PROPERTY_INCLUDES],
    sort: MODERATION_PROPERTY_SORT,
    ...(params.page ? { page: params.page } : {}),
    ...(params.perPage ? { per_page: params.perPage } : {}),
  });
  return apiRequest<ModerationPropertyQueueResponse>(
    `/api/properties/moderation${qs ? `?${qs}` : ''}`,
    { token },
  );
}

export interface PropertyModerationResponse {
  data: ModerationProperty;
}

export async function approveProperty(
  propertyId: number,
  token: string,
): Promise<PropertyModerationResponse> {
  return apiRequest<PropertyModerationResponse>(
    `/api/properties/${propertyId}/approve`,
    { method: 'POST', token },
  );
}

export async function rejectProperty(
  propertyId: number,
  rejectionReason: string,
  token: string,
): Promise<PropertyModerationResponse> {
  return apiRequest<PropertyModerationResponse>(
    `/api/properties/${propertyId}/reject`,
    { method: 'POST', body: { rejection_reason: rejectionReason }, token },
  );
}

export async function resubmitProperty(
  propertyId: number,
  token: string,
): Promise<ApiResponse<unknown>> {
  return apiRequest<ApiResponse<unknown>>(
    `/api/properties/${propertyId}/resubmit`,
    { method: 'POST', token },
  );
}
