import type { ModerationStatus } from '@/lib/queries/reviews-moderation';

/**
 * TCK-376 — les clés d'URL portent le NOM DU FILTRE D'API, pas un alias : une URL qu'on lit dit alors
 * ce que la requête demande, sans table de correspondance entre deux vocabulaires.
 */
export const P_STATUT = 'filter[moderation_status]';

/**
 * TCK-2479 — le statut de la file de modération des avis, tel que la page le lit (`''` : tous). Sorti
 * de `ModerationWorkspace` pour que la garde du menu éprouve le lecteur que la page appelle.
 */
export function statutDeLaFile(lire: (cle: string) => string): ModerationStatus | '' {
  return lire(P_STATUT) as ModerationStatus | '';
}
