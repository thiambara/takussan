import { apiRequest, buildQueryString } from '@/lib/api';
import type {
  ApiResponse,
  PaginatedResponse,
  SpatieQueryParams,
} from '@/types/api';

/**
 * TCK-258 — team query layer.
 *
 * All reads obey the spatie/laravel-query-builder conventions:
 *  - sparse fieldsets via `fields[agent_profiles]=...`
 *  - `include=user` so the listing can show name/email without a
 *    second round-trip
 *  - `filter[agency_id]=...` is implicit (the backend index endpoint
 *    is already agency-scoped via the route param).
 *
 * Mutations target the per-role endpoints introduced by this ticket
 * (`POST /api/agencies/{id}/agents/invite`,
 *  `PATCH /api/profiles/{id}/suspend`, `DELETE /api/profiles/{id}`)
 * plus the generic invitation lifecycle endpoints already shipped in
 * TCK-249 (`POST /api/invitations/{id}/{revoke|resend}`).
 */

export const AGENT_PROFILE_FIELDS = [
  'id',
  'user_id',
  'agency_id',
  'status',
  'metadata',
  'created_at',
] as const;

export type AgentProfileStatus = 'draft' | 'active' | 'inactive' | 'suspended';

export type InvitedRole = 'agent' | 'agent_senior' | 'agent_manager';

export type AgentProfileSummary = {
  readonly id: number;
  readonly user_id: number | null;
  readonly agency_id: number;
  readonly status: AgentProfileStatus;
  readonly metadata: {
    readonly email?: string;
    readonly first_name?: string;
    readonly last_name?: string;
    readonly phone?: string | null;
    readonly invited_role?: InvitedRole;
  } | null;
  readonly created_at: string | null;
  readonly user?: {
    readonly id: number;
    readonly first_name: string;
    readonly last_name: string;
    readonly email: string;
  } | null;
};

export type InviteAgentPayload = {
  readonly email: string;
  readonly role: InvitedRole;
  readonly first_name: string;
  readonly last_name: string;
  readonly phone?: string | null;
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

export interface FetchTeamParams {
  readonly agencyId: number;
  readonly page?: number;
  readonly perPage?: number;
  readonly sort?: string;
  readonly status?: AgentProfileStatus;
  readonly search?: string;
}

function buildParams({
  page,
  perPage,
  sort,
  status,
  search,
}: FetchTeamParams): SpatieQueryParams {
  const filter: Record<string, string | number> = {};
  if (status) filter.status = status;
  if (search) filter.search = search;

  const params: SpatieQueryParams = {
    fields: { agent_profiles: AGENT_PROFILE_FIELDS },
    include: ['user'],
    sort: sort ?? '-created_at',
    page: page ?? 1,
    per_page: perPage ?? 20,
  };
  if (Object.keys(filter).length > 0) {
    params.filter = filter;
  }
  return params;
}

export async function fetchTeam(
  token: string,
  params: FetchTeamParams,
): Promise<PaginatedResponse<AgentProfileSummary>> {
  const qs = buildQueryString(buildParams(params));
  return apiRequest<PaginatedResponse<AgentProfileSummary>>(
    `/api/agencies/${params.agencyId}/team${qs ? `?${qs}` : ''}`,
    { token },
  );
}

export async function inviteAgent(
  token: string,
  agencyId: number,
  payload: InviteAgentPayload,
): Promise<ApiResponse<InvitationSummary>> {
  return apiRequest<ApiResponse<InvitationSummary>>(
    `/api/agencies/${agencyId}/agents/invite`,
    { token, method: 'POST', body: payload },
  );
}

export async function suspendAgentProfile(
  token: string,
  profileId: number,
  active = false,
): Promise<ApiResponse<AgentProfileSummary>> {
  return apiRequest<ApiResponse<AgentProfileSummary>>(
    `/api/profiles/${profileId}/suspend`,
    { token, method: 'PATCH', body: { active } },
  );
}

export async function removeAgentProfile(
  token: string,
  profileId: number,
): Promise<void> {
  await apiRequest<void>(`/api/profiles/${profileId}`, {
    token,
    method: 'DELETE',
  });
}
