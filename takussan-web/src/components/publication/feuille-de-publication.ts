import type { User } from '@/types/user';

/**
 * TCK-2601 — ce que la feuille de compte demande avant de publier, et rien d'autre.
 *
 * - `session` : personne n'est connecté (l'assistant sans compte de `/publish`) ;
 * - `first_name`, `last_name` : prénom et nom sont TOUS DEUX requis dans la feuille (décision 1a du
 *   porteur), alors que l'API n'exige que le prénom (`PublishReadiness`) — un compte qui n'a que le
 *   prénom voit le nom seul ;
 * - `verified_phone` : le numéro que les visiteurs appelleront, vérifié par un code ;
 * - `whatsapp` : un numéro vérifié dont la question WhatsApp n'a jamais reçu de réponse (`null`) —
 *   posée une fois, `false` est une réponse.
 *
 * Les CGU n'en sont pas : elles s'acceptent par la phrase sous le bouton (`accept_terms`).
 *
 * `serveur` : ce que l'API a refusé faute de coordonnées (`missing`, `contact_is_self`). Le contexte
 * peut être périmé (numéro changé ailleurs) : ce que le serveur dit manquer pour SOI s'ajoute, même si
 * le compte en mémoire le croit fait (règle de `CoordonneesPublication`, tour 3 du lot C).
 */
export type ManqueDeLaFeuille = 'session' | 'first_name' | 'last_name' | 'verified_phone' | 'whatsapp';

export interface RefusDuServeur {
  readonly manquants: readonly string[];
  readonly contactEstSoi: boolean;
}

export function manquesDeLaFeuille(user: Partial<User> | null, serveur: RefusDuServeur | null = null): ManqueDeLaFeuille[] {
  if (!user) return ['session', 'first_name', 'last_name', 'verified_phone'];
  const manques = new Set<ManqueDeLaFeuille>();
  if (!user.first_name?.trim()) manques.add('first_name');
  if (!user.last_name?.trim()) manques.add('last_name');
  if (!user.phone_verified_at) manques.add('verified_phone');
  if (serveur?.contactEstSoi) {
    if (serveur.manquants.includes('first_name')) manques.add('first_name');
    if (serveur.manquants.includes('verified_phone')) manques.add('verified_phone');
  }
  if (!manques.has('verified_phone') && user.phone_whatsapp === null) manques.add('whatsapp');
  const ordre: ManqueDeLaFeuille[] = ['first_name', 'last_name', 'verified_phone', 'whatsapp'];
  return ordre.filter((m) => manques.has(m));
}
