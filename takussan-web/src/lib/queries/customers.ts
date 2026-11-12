import { apiRequest, buildQueryString } from '@/lib/api';
import type {
  PaginatedResponse,
  ApiResponse,
  SpatieQueryParams,
} from '@/types/api';
import type {
  CustomerListItem,
  CustomerDetail,
  CustomerNote,
  CustomerRelationship,
} from '@/types/customer';
import type { Tag } from '@/types/tag';
import type { CustomerFormPayload } from '@/lib/schemas/customer';
import { cheminApi, requete } from '@/lib/chemin-api';
import { lireToutesLesPages, PAR_PAGE_MAX } from './toutes-les-pages';

/**
 * Customer (CRM) queries — TCK-042. All reads use spatie query params
 * (fields[], filter[], include, sort). Mutations use the raw REST endpoints
 * documented in the ticket.
 */

/**
 * TCK-2590 — la ligne de la liste : le nom, le téléphone (toujours montré quand il existe) ou à
 * défaut l'e-mail, l'étape, le statut, sa recherche, et les trois attributs calculés de TCK-2588
 * (`next_action`, `follow_up`, `referent`, `null` hors personnel). Sans `occupation` : la ligne ne la
 * montre plus.
 */
export const DASHBOARD_CUSTOMER_FIELDS = [
  'id',
  'first_name',
  'last_name',
  'email',
  'phone',
  'status',
  'pipeline_stage',
  'seeking_contract_type',
  'budget_max',
  'seeking_property_types',
  'seeking_cities',
  'seeking_neighborhoods',
  'next_action',
  'follow_up',
  'referent',
  'created_at',
] as const;

/**
 * Les colonnes des suggestions CRM. `usage_count` n'en est pas une : c'est un compte, que l'API
 * rend toujours et sur lequel elle trie (`sort=-usage_count`). Le demander ici rendait 400 (TCK-712).
 */
// TCK-922 — le slug traduit une étiquette du catalogue CRM (`ESPACE_DES_ETIQUETTES_CRM`).
export const TAG_FIELDS = ['id', 'name', 'slug', 'color'] as const;

export interface DashboardCustomerFilters {
  readonly status?: string;
  readonly pipeline_stage?: string;
  readonly search?: string;
  readonly tags?: string;
  readonly tags_all?: string;
  /** TCK-2588 — `1` : les fiches à relancer (« À relancer », TCK-2590). */
  readonly follow_up?: '1';
  /** TCK-2588 — `me` : « Mes clients » ; `none` : « Sans référent ». */
  readonly referent?: 'me' | 'none';
}

export interface FetchDashboardCustomersParams {
  readonly page?: number;
  readonly perPage?: number;
  readonly sort?: string;
  readonly filters?: DashboardCustomerFilters;
}

function buildListParams({
  page,
  perPage,
  sort,
  filters,
}: FetchDashboardCustomersParams): SpatieQueryParams {
  const filter: Record<string, string> = {};
  if (filters?.status) filter.status = filters.status;
  if (filters?.pipeline_stage) filter.pipeline_stage = filters.pipeline_stage;
  if (filters?.search) filter.search = filters.search;
  if (filters?.tags) filter.tags = filters.tags;
  if (filters?.tags_all) filter.tags_all = filters.tags_all;
  if (filters?.follow_up) filter.follow_up = filters.follow_up;
  if (filters?.referent) filter.referent = filters.referent;

  return {
    fields: { customers: DASHBOARD_CUSTOMER_FIELDS },
    filter,
    include: ['tags'],
    // TCK-702 (P16.02) — une recherche se classe par pertinence côté API (TCK-281), et
    // `defaultSorts()` s'efface devant tout `sort=` explicite : pas de tri par défaut ici.
    sort: sort ?? (filters?.search ? undefined : '-created_at'),
    page: page ?? 1,
    per_page: perPage ?? 20,
  };
}

/**
 * TCK-2590 — le compte d'une vue : `per_page=1`, seul `meta.total` est lu. Les pastilles et le
 * sous-titre en demandent un par vue, en parallèle de la liste ; aucune route de comptes n'existe.
 */
export async function fetchCustomerCount(token: string, filters: DashboardCustomerFilters = {}): Promise<number | null> {
  const filter: Record<string, string> = {};
  for (const [cle, valeur] of Object.entries(filters)) if (valeur) filter[cle] = valeur;
  const qs = buildQueryString({ fields: { customers: ['id'] }, filter, per_page: 1 });
  try {
    const res = await apiRequest<PaginatedResponse<{ id: number }>>(cheminApi`/api/customers${requete(qs)}`, { token });
    return res.meta.total;
  } catch {
    return null;
  }
}

export async function fetchDashboardCustomers(
  token: string,
  params: FetchDashboardCustomersParams = {},
): Promise<PaginatedResponse<CustomerListItem>> {
  const qs = buildQueryString(buildListParams(params));
  return apiRequest<PaginatedResponse<CustomerListItem>>(
    cheminApi`/api/customers${requete(qs)}`,
    { token },
  );
}

/**
 * TCK-955 (ADR-0070 § 5) — le numéro de pièce EN CLAIR : admin de l'agence du client (et
 * super-admin), sous step-up, consultation journalisée par l'API. Hors de React Query, comme
 * `fetchOwnerSensitive` : la valeur ne vit que le temps de l'affichage.
 */
export type CustomerSensitiveData = {
  readonly id: number;
  readonly id_type: string | null;
  readonly id_number: string | null;
};

export async function fetchCustomerSensitive(
  token: string,
  customerId: number,
): Promise<ApiResponse<CustomerSensitiveData>> {
  return apiRequest<ApiResponse<CustomerSensitiveData>>(
    cheminApi`/api/customers/${customerId}/sensitive`,
    { token },
  );
}

export async function fetchDashboardCustomer(
  token: string,
  customerId: number,
): Promise<CustomerDetail> {
  const qs = buildQueryString({
    // TCK-866 (P02.09) — pas `notes` : la fiche et le panneau du pipeline les lisent paginées par
    // `fetchCustomerNotes`, et rien ne lisait les notes sérialisées ici une seconde fois.
    // TCK-2586 — `interestedProperty` : « Planifier une visite » part de son bien d'intérêt (AC3,
    // trois touches depuis la fiche : jour, heure, Confirmer).
    include: ['documents', 'tags', 'interestedProperty'],
  });
  const res = await apiRequest<ApiResponse<CustomerDetail>>(
    cheminApi`/api/customers/${customerId}${requete(qs)}`,
    { token },
  );
  return res.data;
}

/**
 * TCK-2589 — les attributs CALCULÉS que la fiche client demande au show : la prochaine action, la
 * relance due et le référent (TCK-2588). Ce ne sont pas des colonnes : `CustomerCommercialAttributes`
 * les retire de `fields[customers]` avant spatie, et le show rend alors la ressource ENTIÈRE avec eux
 * (mesuré le 2026-11-12). C'est la seule exception à la garde « aucun `fields` vers un show »
 * (`show-sans-fields.garde.test.ts`) : elle vérifie que ces noms sont tous des attributs calculés de
 * l'API, et qu'aucun autre nom n'est envoyé.
 */
export const ATTRIBUTS_CALCULES_DE_LA_FICHE = ['next_action', 'follow_up', 'referent'] as const;

/**
 * TCK-2589 — ce que la fiche lit en une requête : pièces, étiquettes, bien d'intérêt, origine, les
 * trois prochaines visites et les comptes du dossier. Les visites et les comptes ne sont rendus
 * qu'au personnel de l'agence de la fiche : absents, la fiche ne les montre pas.
 */
export const INCLUSIONS_DE_LA_FICHE = [
  'documents',
  'tags',
  'interestedProperty',
  'origin',
  'upcomingVisits',
  'visitsCount',
  'bookingsCount',
  'leasesCount',
] as const;

/**
 * TCK-2589 — la lecture de la fiche client (`/app/customers/[id]`). Distincte de
 * {@link fetchDashboardCustomer}, que lit le panneau du pipeline : la fiche en demande davantage.
 */
export async function fetchFicheDuClient(token: string, customerId: number): Promise<CustomerDetail> {
  const qs = buildQueryString({
    fields: { customers: [...ATTRIBUTS_CALCULES_DE_LA_FICHE] },
    include: [...INCLUSIONS_DE_LA_FICHE],
  });
  const res = await apiRequest<ApiResponse<CustomerDetail>>(
    cheminApi`/api/customers/${customerId}${requete(qs)}`,
    { token },
  );
  return res.data;
}

export async function createCustomer(
  token: string,
  payload: CustomerFormPayload,
): Promise<CustomerDetail> {
  const res = await apiRequest<ApiResponse<CustomerDetail>>('/api/customers', {
    method: 'POST',
    body: payload,
    token,
  });
  return res.data;
}

export async function updateCustomer(
  token: string,
  customerId: number,
  payload: CustomerFormPayload,
): Promise<CustomerDetail> {
  const res = await apiRequest<ApiResponse<CustomerDetail>>(
    cheminApi`/api/customers/${customerId}`,
    {
      method: 'PUT',
      body: payload,
      token,
    },
  );
  return res.data;
}

/**
 * P15.01 (TCK-2351) — inviter le client de la fiche à créer son compte. Aucun corps : l'API envoie le
 * lien à la coordonnée de la fiche, et relie le compte à l'acceptation.
 */
export async function inviteCustomerToAccount(token: string, customerId: number): Promise<void> {
  await apiRequest(cheminApi`/api/customers/${customerId}/invite`, { method: 'POST', token });
}

export async function createCustomerNote(
  token: string,
  customerId: number,
  body: string,
): Promise<CustomerNote> {
  const res = await apiRequest<ApiResponse<CustomerNote>>(
    cheminApi`/api/customers/${customerId}/notes`,
    {
      method: 'POST',
      body: { body },
      token,
    },
  );
  return res.data;
}

/**
 * TCK-1367 (P135.01) — TOUTES les notes du client. L'API les pagine par 20 : une seule page laissait
 * la fiche et le panneau du pipeline sans les plus anciennes, et l'onglet les comptait « 20 ».
 */
export async function fetchCustomerNotes(
  token: string,
  customerId: number,
): Promise<CustomerNote[]> {
  const res = await lireToutesLesPages((page) => {
    // TCK-1842 (P186.03) — pas de `sort` : `CustomerNoteController::index` n'en lit aucun et sert les
    // épinglées d'abord, puis les plus récentes, départagées par l'`id`.
    const qs = buildQueryString({ page, per_page: PAR_PAGE_MAX });
    return apiRequest<PaginatedResponse<CustomerNote>>(
      cheminApi`/api/customers/${customerId}/notes${requete(qs)}`,
      { token },
    );
  });
  return res.data;
}

export async function fetchCustomerRelationships(
  token: string,
  customerId: number,
): Promise<CustomerRelationship[]> {
  const res = await apiRequest<ApiResponse<CustomerRelationship[]>>(
    cheminApi`/api/customers/${customerId}/relationships`,
    { token },
  );
  return res.data;
}

export async function attachCustomerTags(
  token: string,
  customerId: number,
  tags: string[],
): Promise<Pick<Tag, 'id' | 'name' | 'slug' | 'color'>[]> {
  const res = await apiRequest<ApiResponse<Pick<Tag, 'id' | 'name' | 'slug' | 'color'>[]>>(
    cheminApi`/api/customers/${customerId}/tags`,
    { method: 'POST', body: { tags }, token },
  );
  return res.data;
}

export async function detachCustomerTag(
  token: string,
  customerId: number,
  tagId: number,
): Promise<void> {
  await apiRequest<void>(cheminApi`/api/customers/${customerId}/tags/${tagId}`, {
    method: 'DELETE',
    token,
  });
}

export async function fetchCrmTags(
  token: string,
): Promise<Pick<Tag, 'id' | 'name' | 'slug' | 'color'>[]> {
  // TCK-1749 (P171.06) — toutes les pages : une page de 50 taisait les étiquettes les moins employées.
  const res = await lireToutesLesPages((page) =>
    apiRequest<PaginatedResponse<Pick<Tag, 'id' | 'name' | 'slug' | 'color'>>>(
      cheminApi`/api/tags${requete(
        buildQueryString({
          filter: { type: 'crm' },
          fields: { tags: TAG_FIELDS },
          sort: '-usage_count',
          page,
          per_page: PAR_PAGE_MAX,
        }),
      )}`,
      { token },
    ),
  );
  return res.data;
}
