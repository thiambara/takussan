import type { AgencyRoleAssignment } from '@/types/agency-role';
import type { AdminAgencyUserRow } from '@/types/admin-users';

const STAFF = new Set(['agent', 'agency_admin']);

/**
 * TCK-591 §8 (AC23) — « Retirer de l'agence » ne vaut que pour le PERSONNEL (agent, admin
 * d'agence). Un bailleur seul n'est pas « retiré de l'équipe » : l'API le refuse
 * (`agency_member.not_staff`), et l'écran ne le propose plus.
 *
 * Les profils de l'agence (`assignments`) font foi quand ils sont arrivés ; avant, le repli est le
 * TYPE de profil porté par la ligne, comme pour la colonne « Rôle ».
 */
export function isAgencyStaffRow(
  row: AdminAgencyUserRow,
  assignments: readonly AgencyRoleAssignment[] | undefined,
): boolean {
  if (assignments && assignments.length > 0) {
    return assignments.some((a) => STAFF.has(a.profile_type));
  }
  return (row.roles ?? []).some((r) => STAFF.has(typeof r === 'string' ? r : r.name));
}
