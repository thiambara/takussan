import type { UserRole } from '@/types/user';
import { isAdmin, isAgent, isOwner } from '@/lib/roles';

/**
 * Qui voit quelle porte de `/app` — écrit UNE fois pour les deux barres qui y mènent : la barre
 * latérale de `/app` (`AppSidebar`) et le menu de la navbar publique (`Navbar`, TCK-641/642).
 *
 * *Deux listes de rôles finissent toujours par diverger, une liste partagée non* : la navbar
 * publique ne recopie pas la condition d'`AppSidebar`, elle l'importe.
 */

export const HREF_MES_BIENS = '/app/properties';
export const HREF_CREDITS = '/app/credits';

/**
 * `/app/properties` — la même règle que la garde de son layout (`assertCanReachAgentArea`,
 * `lib/auth/guards.ts`) : agent, bailleur ou administrateur. Une entrée montrée à qui la garde
 * renvoie serait un lien qui mène à un refus. `acces-app.test.ts` éprouve l'accord des deux.
 */
export function peutOuvrirMesBiens(roles: UserRole[]): boolean {
  return isAgent(roles) || isOwner(roles) || isAdmin(roles);
}

/**
 * `/app/credits` — le portefeuille de l'espace (TCK-633 lot F, ADR-0061 §1). Le rôle APPROCHE la
 * capacité `boost.spend`, accordée à l'administrateur d'espace ; l'API tranche (403 sinon), et
 * c'est pourquoi le solde ne s'affiche que sur une réponse 200 (TCK-642).
 */
export function voitLePortefeuille(roles: UserRole[]): boolean {
  return isAdmin(roles);
}
