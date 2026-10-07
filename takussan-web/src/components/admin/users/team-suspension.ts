import type { TeamSuspensionAction } from '@/lib/queries/team-suspension';
import type { AdminAgencyUserRow } from '@/types/admin-users';

/** Statuts de profil que `TeamMemberSuspensionService` pose — et donc qu'il sait lever. */
const SUSPENDED = new Set(['suspended', 'blocked']);

/**
 * TCK-587 — le geste de suspension que la console propose pour une ligne, ou `null`.
 *
 * Jugé sur les profils de la ligne DANS cette agence (la liste les inclut :
 * `include=agentProfiles,ownerProfiles,agencyAdminProfiles`) :
 * - aucun profil connu ici, soi-même, ou l'administrateur principal → `null` — l'API refuse
 *   les deux derniers en 422, et un geste qui échoue n'a pas à être offert ;
 * - un profil actif → « Suspendre de l'agence » ;
 * - aucun actif et au moins un suspendu ou bloqué → « Réactiver dans l'agence ».
 *   Une invitation en attente n'est ni l'un ni l'autre : rien n'est proposé.
 */
export function suspensionOffer(
  row: AdminAgencyUserRow,
  agencyId: number,
  currentUserId: number,
  primaryAdminId: number | null,
): TeamSuspensionAction | null {
  if (row.id === currentUserId || row.id === primaryAdminId) return null;

  const here = [
    ...(row.agent_profiles ?? []),
    ...(row.owner_profiles ?? []),
    ...(row.agency_admin_profiles ?? []),
  ].filter((p) => p.agency_id === agencyId);

  if (here.some((p) => p.status === 'active')) return 'suspend';
  if (here.some((p) => SUSPENDED.has(p.status))) return 'reactivate';
  return null;
}
