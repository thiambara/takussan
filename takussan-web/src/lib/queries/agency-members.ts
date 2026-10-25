import { apiRequest } from '@/lib/api';
import type { ApiResponse } from '@/types/api';
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

// TCK-2365 (P242.01) — `addAgencyMember` (`POST /api/agencies/{id}/members`) est parti avec la
// route : un compte existant entre dans l'équipe par l'invitation (`inviteAgencyAgent`).

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
