/**
 * Seuils de saisie d'un avis et de sa réponse, lus par la fiche de bien et par « Mes avis »
 * (TCK-2089, P195.05). Ce sont ceux de l'API, et `seuils-de-saisie.parity.test.ts` les compare
 * aux règles PHP qu'ils recopient :
 * - contenu : `nullable|max:2000` (`StoreForPropertyReviewRequest`, `StoreForAgencyReviewRequest`) —
 *   aucun minimum, un avis peut ne porter qu'une note ;
 * - réponse : `required|max:2000` (`ReplyReviewRequest`) — non vide, sans autre minimum.
 *
 * Un minimum que seul un écran exigerait refuse ce qu'un autre accepte : il n'y en a pas d'autre.
 * ⚠ L'avis d'agent et de prestataire va jusqu'à 5000 à l'API (reste de P195.04, non repris).
 */
export const REVIEW_CONTENT_MAX = 2000;
export const REVIEW_REPLY_MAX = 2000;
