import { capacitesDuProfilActif } from '@/lib/access/pages-admin-server';
import { isAdmin, isAgent, isOwner, isSuperAdmin } from '@/lib/roles';
import type { UserRole } from '@/types/user';

/**
 * P152.03 — ce que `/app/properties/new` offre au profil actif, jugé comme l'API :
 *
 *  · `publication` — le super-admin, ou qui tient `properties.create` (`PropertyPolicy::create`) ;
 *  · `proposition` — sinon, le bailleur (`createsProposal`, TCK-587, ADR-0031) ;
 *  · `null` — ni l'un ni l'autre : l'API refuserait la saisie (403) ;
 *  · `indisponible` — les capacités d'un membre du personnel qui n'est pas bailleur n'ont pas pu
 *    être lues : on ne sait pas.
 *
 * ⚠ Le bailleur se lit par le rôle `owner`, toutes agences confondues (angle 176 des pistes) ; l'API
 * juge le profil de bailleur dans l'agence du profil actif.
 */
export type ModeDeCreation = 'publication' | 'proposition' | 'indisponible' | null;

export async function modeDeCreationDeBien(roles: UserRole[]): Promise<ModeDeCreation> {
  if (isSuperAdmin(roles)) return 'publication';
  let capacites: readonly string[] | null = [];
  if (isAgent(roles) || isAdmin(roles)) {
    capacites = await capacitesDuProfilActif();
    if (capacites?.includes('properties.create')) return 'publication';
  }
  if (isOwner(roles)) return 'proposition';
  return capacites === null ? 'indisponible' : null;
}
