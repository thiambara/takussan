import { apiRequest, buildQueryString } from '@/lib/api';
import type {
  PaginatedResponse,
  ApiResponse,
  SpatieQueryParams,
} from '@/types/api';
import type { User } from '@/types/user';

/**
 * Agency member queries — TCK-065. All reads use spatie query params
 * (fields[], filter[], include, sort). Mutations target the canonical
 * `/api/agencies/{id}/members` routes.
 */

export const AGENCY_MEMBER_FIELDS = [
  'id',
  'first_name',
  'last_name',
  'email',
  'phone',
  'status',
  'agency_id',
  'created_at',
] as const;

export type AgencyMemberRole = 'agent' | 'agency_admin';

export interface AgencyMembersFilters {
  readonly role?: AgencyMemberRole;
  readonly search?: string;
}

export interface FetchAgencyMembersParams {
  readonly page?: number;
  readonly perPage?: number;
  readonly sort?: string;
  readonly filters?: AgencyMembersFilters;
}

function buildMembersParams({
  page,
  perPage,
  sort,
  filters,
}: FetchAgencyMembersParams): SpatieQueryParams {
  const filter: Record<string, string> = {};
  if (filters?.role) filter.role = filters.role;
  if (filters?.search) filter.search = filters.search;

  return {
    fields: { users: AGENCY_MEMBER_FIELDS },
    filter,
    sort: sort ?? '-created_at',
    page: page ?? 1,
    per_page: perPage ?? 20,
  };
}

export async function fetchAgencyMembers(
  agencyId: number,
  token: string,
  params: FetchAgencyMembersParams = {},
): Promise<PaginatedResponse<User>> {
  const qs = buildQueryString(buildMembersParams(params));
  return apiRequest<PaginatedResponse<User>>(
    `/api/agencies/${agencyId}/members${qs ? `?${qs}` : ''}`,
    { token },
  );
}

export interface AddAgencyMemberPayload {
  readonly email?: string;
  readonly user_id?: number;
  readonly role: AgencyMemberRole;
}

export interface AddAgencyMemberResponse {
  readonly user_id: number;
  readonly agency_id: number;
  readonly role: AgencyMemberRole;
  readonly user: User;
}

export async function addAgencyMember(
  agencyId: number,
  payload: AddAgencyMemberPayload,
  token: string,
): Promise<ApiResponse<AddAgencyMemberResponse>> {
  return apiRequest<ApiResponse<AddAgencyMemberResponse>>(
    `/api/agencies/${agencyId}/members`,
    {
      method: 'POST',
      body: payload,
      token,
    },
  );
}

export async function updateAgencyMemberRole(
  agencyId: number,
  userId: number,
  role: AgencyMemberRole,
  token: string,
): Promise<ApiResponse<{ user_id: number; role: string; roles: string[] }>> {
  return apiRequest(
    `/api/agencies/${agencyId}/members/${userId}/role`,
    {
      method: 'PUT',
      body: { role },
      token,
    },
  );
}

export async function removeAgencyMember(
  agencyId: number,
  userId: number,
  token: string,
): Promise<ApiResponse<{ user_id: number; removed: boolean }>> {
  return apiRequest(
    `/api/agencies/${agencyId}/members/${userId}`,
    {
      method: 'DELETE',
      token,
    },
  );
}
