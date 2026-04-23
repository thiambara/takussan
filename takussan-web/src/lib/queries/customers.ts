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
  CustomerDocument,
  CustomerRelationship,
} from '@/types/customer';
import type { CustomerFormPayload } from '@/lib/schemas/customer';

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

export const DASHBOARD_CUSTOMER_DETAIL_FIELDS = [
  ...DASHBOARD_CUSTOMER_FIELDS,
  'birth_date',
  'id_type',
  'id_number',
  'emergency_contact_name',
  'emergency_contact_phone',
  'added_by_id',
  'user_id',
  'metadata',
  'updated_at',
] as const;

export interface DashboardCustomerFilters {
  readonly status?: string;
  readonly pipeline_stage?: string;
  readonly search?: string;
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

  return {
    fields: { customers: DASHBOARD_CUSTOMER_FIELDS },
    filter,
    sort: sort ?? '-created_at',
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
    `/api/customers${qs ? `?${qs}` : ''}`,
    { token },
  );
}

export async function fetchDashboardCustomer(
  token: string,
  customerId: number,
): Promise<CustomerDetail> {
  const qs = buildQueryString({
    fields: { customers: DASHBOARD_CUSTOMER_DETAIL_FIELDS },
    include: ['notes', 'documents'],
  });
  const res = await apiRequest<ApiResponse<CustomerDetail>>(
    `/api/customers/${customerId}${qs ? `?${qs}` : ''}`,
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
    `/api/customers/${customerId}`,
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
    `/api/customers/${customerId}/notes`,
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
    `/api/customers/${customerId}/notes${qs ? `?${qs}` : ''}`,
    { token },
  );
  return res.data;
}

export async function uploadCustomerDocument(
  token: string,
  customerId: number,
  file: File,
): Promise<CustomerDocument> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiRequest<ApiResponse<CustomerDocument>>(
    `/api/customers/${customerId}/documents`,
    {
      method: 'POST',
      body: form,
      token,
      formData: true,
    },
  );
  return res.data;
}

export async function fetchCustomerRelationships(
  token: string,
  customerId: number,
): Promise<CustomerRelationship[]> {
  const res = await apiRequest<ApiResponse<CustomerRelationship[]>>(
    `/api/customers/${customerId}/relationships`,
    { token },
  );
  return res.data;
}

/** Client-side upload guard per TCK-042 (10MB, images + PDF). */
export const CUSTOMER_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const CUSTOMER_DOCUMENT_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,application/pdf';

export function validateCustomerDocumentFile(file: File): string | null {
  if (file.size > CUSTOMER_DOCUMENT_MAX_BYTES) {
    return 'Le fichier dépasse 10 Mo.';
  }
  if (!/^(image\/(jpe?g|png|webp|gif)|application\/pdf)$/.test(file.type)) {
    return 'Type de fichier non autorisé (images ou PDF uniquement).';
  }
  return null;
}
