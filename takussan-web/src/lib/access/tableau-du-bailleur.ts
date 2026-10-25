import { accesAdmin, capacitesDuProfilActif } from '@/lib/access/pages-admin-server';
import { isAdmin, isOwner, isSuperAdmin } from '@/lib/roles';
import type { User } from '@/types/user';

/**
 * TCK-2260 (P116.07) — qui ouvre la vue bailleur (`/app/overview/owner`), comme l'API
 * (`DashboardOwnerController`) : le bailleur par son profil, le super-admin, et l'admin qui détient
 * `reports.view_agency`. Lu par le layout de la vue et par l'aiguillage de `/app/overview`.
 *
 * `null` : capacités illisibles (panne) — à chaque appelant de dire s'il refuse ou dégrade.
 */
export async function vueBailleurOuverte(user: User): Promise<boolean | null> {
  if (isOwner(user.roles) || isSuperAdmin(user.roles)) return true;
  if (!isAdmin(user.roles)) return false;
  const capacites = await capacitesDuProfilActif();
  if (capacites === null) return null;
  return capacites.includes('reports.view_agency');
}

/** Où va l'admin à qui la vue est fermée : la première page qu'il peut ouvrir, comme `garderPageAdmin`. */
export async function repliDeLaVueBailleur(user: User): Promise<string> {
  return (await accesAdmin(user)).chemins[0] ?? '/app';
}
