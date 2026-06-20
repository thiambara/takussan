import { apiRequest, buildQueryString } from '@/lib/api';
import type {
  ApiResponse,
  PaginatedResponse,
  SpatieQueryParams,
} from '@/types/api';

/**
 * TCK-260 — service providers (carnet) query layer.
 *
 * All reads obey the spatie/laravel-query-builder conventions:
 *  - sparse fieldsets via `fields[service_provider_profiles]=...`
 *  - `include=user` so the listing shows the email/name without a
 *    second round-trip
 *  - listing endpoint is per-agency (`/api/agencies/{id}/service-providers`)
 *
 * Mutations target the per-agency invitation endpoint introduced by this
 * ticket plus the generic invitation lifecycle endpoints
 * (`POST /api/invitations/{id}/{revoke|resend}`) shipped in TCK-249.
 */

export const SERVICE_PROVIDER_PROFILE_FIELDS = [
  'id',
  'user_id',
  'status',
  'specialties',
  'service_areas',
  'metadata',
  'created_at',
] as const;

export type ServiceProviderProfileStatus =
  | 'draft'
  | 'active'
  | 'inactive'
  | 'suspended';

export type ServiceProviderProfileSummary = {
  readonly id: number;
  readonly user_id: number | null;
  readonly status: ServiceProviderProfileStatus;
  readonly specialties: readonly string[] | null;
  readonly service_areas: readonly string[] | null;
  readonly metadata: {
    readonly email?: string;
    readonly first_name?: string;
    readonly last_name?: string;
    readonly phone?: string | null;
    readonly trades?: readonly string[];
    readonly intervention_zones?: readonly string[];
  } | null;
  readonly created_at: string | null;
  readonly user?: {
    readonly id: number;
    readonly first_name: string;
    readonly last_name: string;
    readonly email: string;
  } | null;
};

export type InviteServiceProviderPayload = {
  readonly email: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly phone?: string | null;
  readonly trades?: readonly string[];
  readonly intervention_zones?: readonly string[];
  readonly metadata?: {
    readonly from_maintenance_request_id?: number;
  };
};

export type ServiceProviderInvitationSummary = {
  readonly id: number;
  readonly email: string;
  readonly role: string;
  readonly status: 'sent' | 'accepted' | 'revoked' | 'expired';
  readonly agency_id: number | null;
  readonly invitable_type: string | null;
  readonly invitable_id: number | null;
  readonly expires_at: string | null;
};

export type InviteServiceProviderResponse = ApiResponse<ServiceProviderInvitationSummary> & {
  readonly meta?: {
    readonly existing_sp_other_agency: boolean;
    readonly existing_sp_same_agency: boolean;
    readonly service_provider_profile_id: number;
  };
};

export interface FetchServiceProvidersParams {
  readonly agencyId: number;
  readonly page?: number;
  readonly perPage?: number;
  readonly sort?: string;
  readonly status?: ServiceProviderProfileStatus;
  readonly search?: string;
}

function buildParams({
  page,
  perPage,
  sort,
  status,
  search,
}: FetchServiceProvidersParams): SpatieQueryParams {
  const filter: Record<string, string | number> = {};
  if (status) filter.status = status;
  if (search) filter.search = search;

  return {
    fields: { service_provider_profiles: SERVICE_PROVIDER_PROFILE_FIELDS },
    include: ['user'],
    filter,
    sort: sort ?? '-created_at',
    page: page ?? 1,
    per_page: perPage ?? 20,
  };
}

export async function fetchServiceProviders(
  token: string,
  params: FetchServiceProvidersParams,
): Promise<PaginatedResponse<ServiceProviderProfileSummary>> {
  const qs = buildQueryString(buildParams(params));
  return apiRequest<PaginatedResponse<ServiceProviderProfileSummary>>(
    `/api/agencies/${params.agencyId}/service-providers${qs ? `?${qs}` : ''}`,
    { token },
  );
}

export async function inviteServiceProvider(
  token: string,
  agencyId: number,
  payload: InviteServiceProviderPayload,
): Promise<InviteServiceProviderResponse> {
  return apiRequest<InviteServiceProviderResponse>(
    `/api/agencies/${agencyId}/service-providers/invite`,
    { token, method: 'POST', body: payload },
  );
}

export async function resendInvitation(
  token: string,
  invitationId: number,
): Promise<ApiResponse<ServiceProviderInvitationSummary>> {
  return apiRequest<ApiResponse<ServiceProviderInvitationSummary>>(
    `/api/invitations/${invitationId}/resend`,
    { token, method: 'POST' },
  );
}

export async function revokeInvitation(
  token: string,
  invitationId: number,
): Promise<ApiResponse<ServiceProviderInvitationSummary>> {
  return apiRequest<ApiResponse<ServiceProviderInvitationSummary>>(
    `/api/invitations/${invitationId}/revoke`,
    { token, method: 'POST' },
  );
}
