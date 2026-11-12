import { isAgencyAdmin } from '@/lib/roles';
import type { UserRole } from '@/types/user';

/**
 * TCK-2641 (décision 3a) — qui ouvre la fiche d'un bailleur (`/app/owners/{id}`) : l'admin d'agence.
 * Le SEUL prédicat de cette règle : la garde de la page (`assertCanReachOwnerAccount`), le lien du
 * carnet et celui de la fiche du bien le lisent tous (vérification adverse de TCK-2639, d1 : la fiche
 * du bien offrait le lien au super-admin par `isAdmin`, et la page le renvoyait vers `/app`).
 */
export function ouvreLaFicheDuBailleur(roles: readonly UserRole[]): boolean {
  return isAgencyAdmin([...roles]);
}
