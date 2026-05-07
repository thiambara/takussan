import { ApiError } from '@/lib/api';
import type {
  AdminAgenciesResponse,
  AdminAgencyDetailResponse,
  AdminAgencyHealthResponse,
  AdminAgencyTeamResponse,
  AdminPropertiesResponse,
  AuditLogResponse,
  ImpersonationStartResponse,
  ImpersonationStopResponse,
  SystemMetricsResponse,
} from '@/types/super-admin';

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<T>;
}

export async function fetchAdminAgencies(params: {
  status?: string;
  search?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<AdminAgenciesResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[agencies]', 'id,name,slug,status,is_verified,verified_at,primary_admin_id,license_number,email,phone,created_at');
  if (params.status) qs.set('filter[status]', params.status);
  if (params.search) qs.set('filter[search]', params.search);
  if (params.page) qs.set('page', String(params.page));
  if (params.perPage) qs.set('per_page', String(params.perPage));
  const query = qs.toString();
  const res = await fetch(`/api/super-admin/agencies${query ? `?${query}` : ''}`, {
    credentials: 'include',
  });
  return jsonOrThrow<AdminAgenciesResponse>(res);
}

export async function fetchAdminAgencyDetail(agencyId: number): Promise<AdminAgencyDetailResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[agencies]', 'id,name,slug,status,is_verified,verified_at,license_number,email,phone,website,description,commission_rate,currency,founded_at,created_at');
  qs.set('include', 'primaryAdmin,address');
  const res = await fetch(`/api/super-admin/agencies/${agencyId}?${qs.toString()}`, {
    credentials: 'include',
  });
  return jsonOrThrow<AdminAgencyDetailResponse>(res);
}

export async function fetchAdminAgencyHealth(agencyId: number): Promise<AdminAgencyHealthResponse> {
  const res = await fetch(`/api/super-admin/agencies/${agencyId}/health`, {
    credentials: 'include',
  });
  return jsonOrThrow<AdminAgencyHealthResponse>(res);
}

export async function fetchAdminAgencyTeam(agencyId: number): Promise<AdminAgencyTeamResponse> {
  const qs = new URLSearchParams();
  qs.set('include', 'roles');
  qs.set('fields[users]', 'id,first_name,last_name,email,status,last_login_at');
  qs.set('per_page', '10');
  const res = await fetch(`/api/super-admin/agencies/${agencyId}/team?${qs.toString()}`, {
    credentials: 'include',
  });
  return jsonOrThrow<AdminAgencyTeamResponse>(res);
}

export async function fetchAdminAgencyProperties(agencyId: number): Promise<AdminPropertiesResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[properties]', ADMIN_PROPERTY_FIELDS.join(','));
  qs.set('include', 'address,agency');
  qs.set('sort', '-created_at');
  qs.set('per_page', '8');
  const res = await fetch(`/api/super-admin/agencies/${agencyId}/properties?${qs.toString()}`, {
    credentials: 'include',
  });
  return jsonOrThrow<AdminPropertiesResponse>(res);
}

export async function postAgencyAction(
  agencyId: number,
  action: 'verify' | 'suspend' | 'unverify',
): Promise<unknown> {
  const res = await fetch(`/api/super-admin/agencies/${agencyId}/${action}`, {
    method: 'POST',
    credentials: 'include',
  });
  return jsonOrThrow<unknown>(res);
}

export async function fetchSystemMetrics(): Promise<SystemMetricsResponse> {
  const res = await fetch('/api/super-admin/system/metrics', { credentials: 'include' });
  return jsonOrThrow<SystemMetricsResponse>(res);
}

export async function postImpersonate(targetUserId: number): Promise<ImpersonationStartResponse> {
  const res = await fetch(`/api/super-admin/users/${targetUserId}/impersonate`, {
    method: 'POST',
    credentials: 'include',
  });
  return jsonOrThrow<ImpersonationStartResponse>(res);
}

export async function postStopImpersonation(targetUserId: number): Promise<ImpersonationStopResponse> {
  const res = await fetch('/api/super-admin/impersonate/stop', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: targetUserId }),
  });
  return jsonOrThrow<ImpersonationStopResponse>(res);
}

/**
 * TCK-132 — sparse fields for the super-admin property table. Driven by
 * `fields[properties]=...` so the API only ships columns the UI renders.
 * Computed attributes (e.g. `main_photo_url`, `location`, `*_label`) are not
 * real DB columns and must NOT appear here — spatie rejects them with HTTP
 * 400 (`InvalidFieldQuery`).
 *
 * `agency_id` is included even though the table renders `agency.name` from the
 * `include=agency` relation: Eloquent needs the foreign key on each parent row
 * to eager-load the `belongsTo(Agency::class)` relation, otherwise `row.agency`
 * comes back null for every property.
 */
export const ADMIN_PROPERTY_FIELDS = [
  'id',
  'agency_id',
  'reference_number',
  'title',
  'slug',
  'type',
  'contract_type',
  'status',
  'visibility',
  'price',
  'currency',
  'published_at',
  'created_at',
] as const;

export interface FetchAdminPropertiesParams {
  readonly search?: string;
  readonly status?: string;
  readonly type?: string;
  readonly visibility?: string;
  readonly agencyId?: number;
  readonly sort?: string;
  readonly page?: number;
  readonly perPage?: number;
}

export async function fetchAdminProperties(
  params: FetchAdminPropertiesParams = {},
): Promise<AdminPropertiesResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[properties]', ADMIN_PROPERTY_FIELDS.join(','));
  qs.set('include', 'address,agency');
  if (params.search) qs.set('filter[search]', params.search);
  if (params.status) qs.set('filter[status]', params.status);
  if (params.type) qs.set('filter[type]', params.type);
  if (params.visibility) qs.set('filter[visibility]', params.visibility);
  if (typeof params.agencyId === 'number') qs.set('filter[agency_id]', String(params.agencyId));
  qs.set('sort', params.sort ?? '-created_at');
  qs.set('page', String(params.page ?? 1));
  qs.set('per_page', String(params.perPage ?? 20));

  const res = await fetch(`/api/super-admin-properties?${qs.toString()}`, {
    credentials: 'include',
  });
  return jsonOrThrow<AdminPropertiesResponse>(res);
}

export async function postPropertyAction(
  propertyId: number,
  action: 'publish' | 'unpublish',
): Promise<unknown> {
  const res = await fetch(`/api/super-admin-properties/${propertyId}/${action}`, {
    method: 'POST',
    credentials: 'include',
  });
  return jsonOrThrow<unknown>(res);
}

export async function archiveProperties(
  propertyIds: number[],
  reason?: string,
): Promise<{ archived: number; failed: number; archived_ids: number[] }> {
  const res = await fetch('/api/super-admin-properties/bulk-archive', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ property_ids: propertyIds, reason }),
  });
  return jsonOrThrow<{ archived: number; failed: number; archived_ids: number[] }>(res);
}

export async function deleteProperty(propertyId: number): Promise<unknown> {
  const res = await fetch(`/api/super-admin-properties/${propertyId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (res.status === 204) return null;
  return jsonOrThrow<unknown>(res);
}

export async function fetchAuditLog(params: {
  event?: string;
  causerId?: number;
  subjectType?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<AuditLogResponse> {
  const qs = new URLSearchParams();
  if (params.event) qs.set('filter[event]', params.event);
  if (params.causerId) qs.set('filter[causer_id]', String(params.causerId));
  if (params.subjectType) qs.set('filter[subject_type]', params.subjectType);
  if (params.dateFrom) qs.set('filter[date_from]', params.dateFrom);
  if (params.dateTo) qs.set('filter[date_to]', params.dateTo);
  if (params.page) qs.set('page', String(params.page));
  if (params.perPage) qs.set('per_page', String(params.perPage));
  qs.set('include', 'causer');
  const res = await fetch(`/api/super-admin/audit?${qs.toString()}`, {
    credentials: 'include',
  });
  return jsonOrThrow<AuditLogResponse>(res);
}
