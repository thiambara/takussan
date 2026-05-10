import { apiRequest, buildQueryString } from '@/lib/api';
import type {
  ApiResponse,
  PaginatedResponse,
  SpatieQueryParams,
} from '@/types/api';

/**
 * TCK-256 — owners query layer.
 *
 * All reads obey the spatie/laravel-query-builder conventions:
 *  - sparse fieldsets via `fields[owner_profiles]=...`
 *  - `include=user` so the listing can show the email/name without a
 *    second round-trip
 *  - `filter[agency_id]=...` (the backend index endpoint is agency-aware)
 *
 * Mutations target the per-role endpoint introduced by this ticket
 * (`POST /api/agencies/{id}/owners/invite`) plus the generic invitation
 * lifecycle endpoints (`POST /api/invitations/{id}/{revoke|resend}`)
 * already shipped in TCK-249.
 */

export const OWNER_PROFILE_FIELDS = [
  'id',
  'user_id',
  'agency_id',
  'status',
  'metadata',
  'created_at',
] as const;

export type OwnerProfileStatus =
  | 'draft'
  | 'active'
  | 'inactive'
  | 'blocked';

export type OwnerProfileSummary = {
  readonly id: number;
  readonly user_id: number | null;
  readonly agency_id: number;
  readonly status: OwnerProfileStatus;
  readonly metadata: {
    readonly email?: string;
    readonly first_name?: string;
    readonly last_name?: string;
    readonly phone?: string | null;
    readonly owner_type?: 'individual' | 'company';
    readonly company_name?: string | null;
  } | null;
  readonly created_at: string | null;
  readonly user?: {
    readonly id: number;
    readonly first_name: string;
    readonly last_name: string;
    readonly email: string;
  } | null;
};

export type InviteOwnerPayload = {
  readonly email: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly phone?: string | null;
  readonly owner_type: 'individual' | 'company';
  readonly company_name?: string | null;
};

export type InvitationSummary = {
  readonly id: number;
  readonly email: string;
  readonly role: string;
  readonly status: 'sent' | 'accepted' | 'revoked' | 'expired';
  readonly agency_id: number | null;
  readonly invitable_type: string | null;
  readonly invitable_id: number | null;
  readonly expires_at: string | null;
};

export interface FetchOwnersParams {
  readonly agencyId: number;
  readonly page?: number;
  readonly perPage?: number;
  readonly sort?: string;
  readonly status?: OwnerProfileStatus;
  readonly search?: string;
}

function buildParams({
  agencyId,
  page,
  perPage,
  sort,
  status,
  search,
}: FetchOwnersParams): SpatieQueryParams {
  const filter: Record<string, string | number> = { agency_id: agencyId };
  if (status) filter.status = status;
  if (search) filter.search = search;

  return {
    fields: { owner_profiles: OWNER_PROFILE_FIELDS },
    include: ['user'],
    filter,
    sort: sort ?? '-created_at',
    page: page ?? 1,
    per_page: perPage ?? 20,
  };
}

export async function fetchOwners(
  token: string,
  params: FetchOwnersParams,
): Promise<PaginatedResponse<OwnerProfileSummary>> {
  const qs = buildQueryString(buildParams(params));
  return apiRequest<PaginatedResponse<OwnerProfileSummary>>(
    `/api/owners${qs ? `?${qs}` : ''}`,
    { token },
  );
}

export async function inviteOwner(
  token: string,
  agencyId: number,
  payload: InviteOwnerPayload,
): Promise<ApiResponse<InvitationSummary>> {
  return apiRequest<ApiResponse<InvitationSummary>>(
    `/api/agencies/${agencyId}/owners/invite`,
    { token, method: 'POST', body: payload },
  );
}

export async function resendInvitation(
  token: string,
  invitationId: number,
): Promise<ApiResponse<InvitationSummary>> {
  return apiRequest<ApiResponse<InvitationSummary>>(
    `/api/invitations/${invitationId}/resend`,
    { token, method: 'POST' },
  );
}

export async function revokeInvitation(
  token: string,
  invitationId: number,
): Promise<ApiResponse<InvitationSummary>> {
  return apiRequest<ApiResponse<InvitationSummary>>(
    `/api/invitations/${invitationId}/revoke`,
    { token, method: 'POST' },
  );
}
