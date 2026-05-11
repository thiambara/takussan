import { apiRequest, buildQueryString } from '@/lib/api';
import type {
  ApiResponse,
  PaginatedResponse,
  SpatieQueryParams,
} from '@/types/api';
import type {
  AgencyUpgradeRequest,
  AgencyUpgradeRequestFormFields,
} from '@/types/agency-upgrade';

/**
 * TCK-267 — query layer for the agency upgrade-request flow
 * (`POST /api/agencies/{id}/upgrade-requests`, etc).
 *
 * All reads obey the spatie/laravel-query-builder conventions: sparse
 * fieldsets via `fields[agency_upgrade_requests]=...` and explicit sort
 * order so we never round-trip through the client to display the latest.
 */

export const AGENCY_UPGRADE_REQUEST_FIELDS = [
  'id',
  'agency_id',
  'submitted_by',
  'rc',
  'ninea',
  'rib_pro',
  'company_legal_name',
  'address_fiscale',
  'planned_agents_count',
  'status',
  'submitted_at',
  'reviewed_by',
  'reviewed_at',
  'review_comment',
  'created_at',
  'updated_at',
] as const;

function buildIndexParams(): SpatieQueryParams {
  return {
    fields: { agency_upgrade_requests: AGENCY_UPGRADE_REQUEST_FIELDS },
    sort: '-submitted_at',
    per_page: 20,
  };
}

export async function fetchAgencyUpgradeRequests(
  token: string,
  agencyId: number,
): Promise<PaginatedResponse<AgencyUpgradeRequest>> {
  const qs = buildQueryString(buildIndexParams());
  return apiRequest<PaginatedResponse<AgencyUpgradeRequest>>(
    `/api/agencies/${agencyId}/upgrade-requests${qs ? `?${qs}` : ''}`,
    { token },
  );
}

/**
 * Multipart submission — the `statuts_doc` File is sent as a regular form
 * part. The remaining textual fields ride alongside it in the same body.
 */
export async function submitAgencyUpgradeRequest(
  token: string,
  agencyId: number,
  fields: AgencyUpgradeRequestFormFields,
  statutsDoc: File,
): Promise<ApiResponse<AgencyUpgradeRequest>> {
  const form = new FormData();
  form.append('rc', fields.rc);
  form.append('ninea', fields.ninea);
  form.append('rib_pro', fields.rib_pro);
  form.append('company_legal_name', fields.company_legal_name);
  form.append('address_fiscale', fields.address_fiscale);
  if (fields.planned_agents_count !== null) {
    form.append('planned_agents_count', String(fields.planned_agents_count));
  }
  form.append('statuts_doc', statutsDoc);

  return apiRequest<ApiResponse<AgencyUpgradeRequest>>(
    `/api/agencies/${agencyId}/upgrade-requests`,
    { token, method: 'POST', body: form, formData: true },
  );
}

export async function revokeAgencyUpgradeRequest(
  token: string,
  agencyId: number,
  requestId: number,
): Promise<ApiResponse<AgencyUpgradeRequest>> {
  return apiRequest<ApiResponse<AgencyUpgradeRequest>>(
    `/api/agencies/${agencyId}/upgrade-requests/${requestId}`,
    { token, method: 'DELETE' },
  );
}
