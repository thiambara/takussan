import { apiRequest } from '@/lib/api';
import type { ApiResponse } from '@/types/api';

/**
 * TCK-587 (ADR-0031 §2) — suspendre un membre DANS l'agence, jamais sur son compte.
 *
 * `POST /api/agencies/{agency}/team/{user}/suspend|reactivate` : tous les profils de la cible
 * dans l'agence passent `suspended` (agent, admin) ou `blocked` (bailleur) ; `users.status` ne
 * bouge pas, et ses autres agences non plus. Le blocage de COMPTE (`/users/{id}/block`) est
 * réservé au super-admin depuis ce ticket.
 */
export type TeamSuspensionAction = 'suspend' | 'reactivate';

export interface TeamSuspensionResult {
  readonly user_id: number;
  readonly profiles: readonly { type: string; id: number; status: string }[];
}

export async function postTeamSuspension(
  agencyId: number,
  userId: number,
  action: TeamSuspensionAction,
  token: string,
): Promise<ApiResponse<TeamSuspensionResult>> {
  return apiRequest(`/api/agencies/${agencyId}/team/${userId}/${action}`, {
    method: 'POST',
    token,
  });
}
