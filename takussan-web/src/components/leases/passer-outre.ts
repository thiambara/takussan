import type { Profile } from '@/types/profile';

/**
 * TCK-593 (passe 3, m3) — qui peut passer outre à un checkout ouvert : la règle des deux requêtes
 * de l'API (`MarkPaidLeasePaymentRequest`, `MarkLateFeePaidRequest`). Le personnel ACTIF de
 * l'agence du bail (profil d'agent ou d'admin) ; sur un bail sans agence, son bailleur.
 *
 * Le serveur reste seul arbitre : cette fonction ne décide que de l'OFFRE, pour ne pas faire saisir
 * un motif qu'un 403 refuserait ensuite. Les délégations de rôle n'y figurent pas — un délégué
 * n'encaisse pas du tout (`recordPayment`), il ne passe donc jamais outre.
 */
export function peutPasserOutreAuCheckout(
  bail: { readonly agencyId: number | null; readonly landlordId: number | null },
  utilisateurId: number | null | undefined,
  profils: readonly Pick<Profile, 'type' | 'agency_id' | 'status'>[],
): boolean {
  if (utilisateurId == null) return false;
  if (bail.agencyId === null) return bail.landlordId !== null && bail.landlordId === utilisateurId;
  return profils.some(
    (p) =>
      (p.type === 'agent' || p.type === 'agency_admin') &&
      p.agency_id === bail.agencyId &&
      p.status === 'active',
  );
}
