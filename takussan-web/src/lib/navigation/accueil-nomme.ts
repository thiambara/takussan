import type { ProfileType } from '@/types/profile';
import type { UserRole } from '@/types/user';
import { DISPOSITIONS } from './dispositions';
import { resoudrePersona } from './personas';

/**
 * TCK-2619 — l'accueil de `/app` s'appelle-t-il « Aujourd'hui » au menu de ce compte (la disposition
 * nomme `tableau-de-bord` `today` : l'agent, TCK-2618) ? La page introuvable le lit AU SERVEUR pour
 * écrire « Retour à Aujourd'hui » plutôt que « Retour à l'accueil » dans le HTML de la réponse 404.
 *
 * Le serveur n'a pas `espaceIndividuel` (un contexte client) : le persona se résout ici sans
 * `agenceIndividuelle`. Ce réglage ne départage que l'admin, l'hôte et le bailleur ;
 * `accueil-nomme.test.ts` refuse qu'il change la réponse pour quelque compte que ce soit.
 */
export function accueilNommeAujourdhui({
  roles,
  typeProfilActif = null,
}: {
  readonly roles: UserRole[];
  readonly typeProfilActif?: ProfileType | null;
}): boolean {
  return DISPOSITIONS[resoudrePersona({ roles, typeProfilActif })].libelles?.['tableau-de-bord'] === 'today';
}
