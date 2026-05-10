import { apiRequest, buildQueryString } from '@/lib/api';
import type { ApiResponse, SpatieQueryParams } from '@/types/api';
import type { Agency } from '@/types/agency';
import type { AgencyFormPayload } from '@/lib/schemas/agency';

/**
 * Agency admin-config queries — TCK-015 / TCK-064. All reads pass the
 * canonical spatie query params. Callers must always supply a
 * `fields[agencies]` subset to avoid fetching unused columns.
 */

export const AGENCY_ADMIN_FIELDS = [
  'id',
  'name',
  'slug',
  'license_number',
  'description',
  'email',
  'phone',
  'website',
  'commission_rate',
  'status',
  // TCK-248 / TCK-256 — `kind` gates owner-invitation features in /app/owners.
  'kind',
] as const;

function buildShowParams(): SpatieQueryParams {
  return {
    fields: { agencies: AGENCY_ADMIN_FIELDS },
  };
}

export async function fetchAgency(token: string, agencyId: number): Promise<Agency> {
  const qs = buildQueryString(buildShowParams());
  const res = await apiRequest<ApiResponse<Agency>>(
    `/api/agencies/${agencyId}${qs ? `?${qs}` : ''}`,
    { token },
  );
  return res.data;
}

export async function updateAgency(
  token: string,
  agencyId: number,
  payload: AgencyFormPayload,
): Promise<Agency> {
  const res = await apiRequest<ApiResponse<Agency>>(`/api/agencies/${agencyId}`, {
    method: 'PATCH',
    body: payload,
    token,
  });
  return res.data;
}

export async function uploadAgencyLogo(
  token: string,
  agencyId: number,
  file: File,
): Promise<Agency> {
  const form = new FormData();
  form.append('file', file);
  form.append('model_type', 'App\\Models\\Agency');
  form.append('model_id', String(agencyId));
  form.append('collection', 'logo');
  await apiRequest<unknown>(`/api/media`, {
    method: 'POST',
    body: form,
    token,
    formData: true,
  });
  // Refresh the agency so we get the new logo_url.
  return fetchAgency(token, agencyId);
}
