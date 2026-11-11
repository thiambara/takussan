'use client';

import { useMyProfiles } from '@/hooks/useProfiles';

const PROFILS_DU_PERSONNEL: ReadonlySet<string> = new Set(['agent', 'agency_admin']);

/**
 * Le profil ACTIF est-il du personnel actif de l'agence visée ? Le pendant, côté affichage, de
 * `PersonnelDeLAgence::estPersonnel()` : un profil agent ou admin, au statut `active`, dans
 * l'agence du bien. Ce n'est qu'une politesse — l'API décide.
 *
 * Passe 2 (n4, TCK-590) — lu sur le profil actif, jamais sur les rôles GLOBAUX : un agent SUSPENDU,
 * ou dont le profil actif est celui d'une autre agence, voyait le geste, et l'API, qui le traite en
 * non-personnel, le faisait réserver pour lui-même.
 *
 * Sorti de `PlanifierUneVisite` par TCK-2580 : la saisie d'une candidature ou d'une offre suit la
 * même règle (`BookingPolicy::recordForCustomer`).
 *
 * @param agencyId l'agence du bien, quand on la connaît. `null` : bien sans agence, qui n'a aucun
 *   personnel. Omise : l'agence du profil actif (fiche client, liste des réservations).
 */
export function usePersonnelActif(agencyId?: number | null): boolean {
  const { data } = useMyProfiles();
  const actif = data?.data.find((p) => p.id === data.meta.active_profile_id);
  if (!actif || !PROFILS_DU_PERSONNEL.has(actif.type) || actif.status !== 'active') return false;
  if (agencyId === undefined) return actif.agency_id !== null;
  return agencyId !== null && actif.agency_id === agencyId;
}
