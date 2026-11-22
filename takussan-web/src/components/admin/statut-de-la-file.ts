import type { FetchModerationQueueParams, ModerationStatus } from '@/lib/queries/reviews-moderation';

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

/**
 * TCK-2479 (revue, I3) — la lecture du compteur « avis à modérer » du menu : la vue « En attente » de
 * la page (`?filter[moderation_status]=pending`, la cible de la pastille), dont on lit `meta.total`.
 *
 * Le compteur lisait `meta.pending_count`, que l'API calcule À PART (`ReviewModerationScope::
 * pendingCount`) : pour le super-admin, en attente ET signalés. La page ne sait filtrer qu'UN statut
 * (`ReviewController::index`, liste ignorée — TCK-1407) : sa pastille « 2 avis » ouvrait une liste
 * vide quand les deux étaient signalés. Compter le total de la vue même où l'on mène rend l'écart
 * impossible, pour tout persona — y compris l'admin d'agence, dont `pending_count` écarte les avis de
 * prestataire que la vue « En attente » montre pourtant. Les avis signalés restent la file de la
 * console plateforme (`/super-admin/moderation`, son propre compteur).
 */
export const COMPTE_DES_AVIS_EN_ATTENTE = { status: 'pending', perPage: 1 } as const satisfies FetchModerationQueueParams;
