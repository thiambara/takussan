import { apiRequest } from '@/lib/api';
import type { ApiResponse } from '@/types/api';
import type { User } from '@/types/user';
import { cheminApi } from '@/lib/chemin-api';

/**
 * Agency member mutations — TCK-065. They target the canonical
 * `/api/agencies/{id}/members` routes.
 */

export const AGENCY_MEMBER_FIELDS = [
  'id',
  'first_name',
  'last_name',
  'email',
  'phone',
  'status',
  'created_at',
] as const;

export type AgencyMemberRole = 'agent' | 'agency_admin';

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
    cheminApi`/api/agencies/${agencyId}/members`,
    {
      method: 'POST',
      body: payload,
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
    cheminApi`/api/agencies/${agencyId}/members/${userId}`,
    {
      method: 'DELETE',
      token,
    },
  );
}
