import type { PropertyConversationResolution } from '@/types/message';

/**
 * TCK-500 — faut-il proposer « Envoyer un message » sur cette fiche ?
 *
 * Trois lignes, extraites du composant parce qu'elles portent une règle qu'une régression
 * retourne sans qu'on la voie : **tant qu'on ne SAIT pas, on propose.**
 *
 * L'inverse — masquer par défaut et n'afficher qu'après la réponse du serveur — paraît plus
 * prudent et est plus mauvais : le bouton principal de la fiche disparaîtrait le temps d'un
 * aller-retour réseau, chez tout le monde, pour couvrir le cas rare de l'agent qui regarde son
 * propre bien. Un bouton qui apparaît après coup est un bouton qu'on n'a pas cliqué.
 *
 * Le destinataire, lui, est reconnu **sans attendre le réseau** : c'est de loin le cas le plus
 * fréquent du refus, et c'est le seul que la fiche peut trancher seule.
 */
export function peutContacterLeBien(params: {
  /** `null` pour un visiteur anonyme — le contact public reste ouvert, sans compte. */
  readonly utilisateurId: number | null;
  /**
   * Le DESTINATAIRE annoncé par la fiche — `primary_contact` (TCK-502), et non le propriétaire.
   *
   * ⚠️ Ce paramètre s'appelait `proprietaireId` et lisait `property.owner`. Sur un bien confié à
   * un agent, l'agent voyait donc « Envoyer un message » sur SON propre bien, et le bouton
   * ouvrait un fil avec lui-même — que le serveur refusait ensuite en 422.
   */
  readonly destinataireId: number | null | undefined;
  /** `null` tant que la résolution n'a pas répondu. */
  readonly resolution: Pick<PropertyConversationResolution, 'can_message'> | null;
}): boolean {
  const { utilisateurId, destinataireId, resolution } = params;

  if (utilisateurId !== null && destinataireId != null && destinataireId === utilisateurId) {
    return false;
  }
  return resolution === null || resolution.can_message;
}
