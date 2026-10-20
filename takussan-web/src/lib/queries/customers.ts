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

/**
 * Customer (CRM) queries — TCK-042. All reads use spatie query params
 * (fields[], filter[], include, sort). Mutations use the raw REST endpoints
 * documented in the ticket.
 */

export const DASHBOARD_CUSTOMER_FIELDS = [
  'id',
  'first_name',
  'last_name',
  'email',
  'phone',
  'status',
  'pipeline_stage',
  'occupation',
  'created_at',
] as const;

/**
 * Les colonnes des suggestions CRM. `usage_count` n'en est pas une : c'est un compte, que l'API
 * rend toujours et sur lequel elle trie (`sort=-usage_count`). Le demander ici rendait 400 (TCK-712).
 */
// TCK-922 — le slug traduit une étiquette du catalogue CRM (`ESPACE_DES_ETIQUETTES_CRM`).
export const TAG_FIELDS = ['id', 'name', 'slug', 'color'] as const;

export const DASHBOARD_CUSTOMER_DETAIL_FIELDS = [
  ...DASHBOARD_CUSTOMER_FIELDS,
  'id_type',
  // TCK-953 — pas d'`id_number` : l'API le refuse (400) et rend `id_number_masked` à la fiche.
  'emergency_contact_name',
  'emergency_contact_phone',
  'added_by_id',
  'user_id',
  'agency_id',
  'metadata',
  'updated_at',
  // TCK-921 — la langue des messages du client sans compte.
  'locale',
  // TCK-591 §5 — critères du prospect.
  'seeking_contract_type',
  'budget_min',
  'budget_max',
  'seeking_property_types',
  'seeking_cities',
  'seeking_neighborhoods',
  'min_bedrooms',
] as const;

export interface DashboardCustomerFilters {
  readonly status?: string;
  readonly pipeline_stage?: string;
  readonly search?: string;
  readonly tags?: string;
  readonly tags_all?: string;
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
    fields: { customers: DASHBOARD_CUSTOMER_DETAIL_FIELDS },
    // TCK-866 (P02.09) — pas `notes` : la fiche et le panneau du pipeline les lisent paginées par
    // `fetchCustomerNotes`, et rien ne lisait les notes sérialisées ici une seconde fois.
    include: ['documents', 'tags'],
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

export async function fetchCustomerNotes(
  token: string,
  customerId: number,
): Promise<CustomerNote[]> {
  const qs = buildQueryString({ sort: '-created_at' });
  const res = await apiRequest<ApiResponse<CustomerNote[]>>(
    cheminApi`/api/customers/${customerId}/notes${requete(qs)}`,
    { token },
  );
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
  const qs = buildQueryString({
    filter: { type: 'crm' },
    fields: { tags: TAG_FIELDS },
    sort: '-usage_count',
    per_page: 50,
  });
  const res = await apiRequest<{ data: Pick<Tag, 'id' | 'name' | 'slug' | 'color'>[] }>(
    cheminApi`/api/tags${requete(qs)}`,
    { token },
  );
  return res.data;
}

/** Client-side upload guard per TCK-042 (10MB, images + PDF). */
export const CUSTOMER_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Motif de refus d'un document client — un JETON, pas un libellé (TCK-292).
 *
 * Ce module est importé par une *server action* (`app/actions/dashboard-customers.ts`) comme par
 * du code client : `useTranslations` n'y est pas appelable, et `getTranslations` ferait de tout
 * appelant une fonction asynchrone. La donnée porte donc la clé, et le rendu la résout — même
 * patron que `property-form/options.ts` et `lib/property-cta.ts`.
 */
export type CustomerDocumentRejection = 'tooLarge' | 'unsupportedType';

/** Espace de noms où vivent les deux libellés de refus. */
export const CUSTOMER_DOCUMENT_REJECTION_NAMESPACE = 'serverActions.customerDocuments' as const;

export function validateCustomerDocumentFile(file: File): CustomerDocumentRejection | null {
  if (file.size > CUSTOMER_DOCUMENT_MAX_BYTES) {
    return 'tooLarge';
  }
  if (!/^(image\/(jpe?g|png|webp|gif)|application\/pdf)$/.test(file.type)) {
    return 'unsupportedType';
  }
  return null;
}
