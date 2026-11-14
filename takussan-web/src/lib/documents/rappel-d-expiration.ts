import { echeanceDe } from './coffre';

/** Les jalons du rappel, en jours avant l'échéance (`DocumentExpiryReminder::REMINDER_DAYS`). */
export type JalonDuRappel = 60 | 7;

/**
 * TCK-2783 — la promesse « Nous vous préviendrons 60 jours avant », rendue à l'écran maintenant que
 * `documents:remind-expiring` envoie le rappel (J-60, puis J-7, au jour de Dakar).
 *
 * Elle ne s'affiche que là où elle est vraie pour CE lecteur, sur une pièce de « Mes pièces » (portée
 * par son propre compte : le rappel va au compte qui la porte), et dit le prochain rappel à venir
 * (décision de la session du 2026-11-14) :
 * - à plus de 60 jours de l'échéance : « 60 jours avant » ;
 * - entre 8 et 60 jours : « 7 jours avant » (le rappel de J-60 est passé) ;
 * - à 7 jours ou moins, expirée ou sans date : rien (aucun rappel ne reste à venir).
 *
 * Ailleurs, rien : une pièce d'une fiche, d'un bail ou d'un bien a d'autres lecteurs que celui qui la
 * reçoit, et la phrase leur promettrait un rappel qui ne leur est pas adressé.
 */

/** Le `documentable_type` qu'écrit l'API pour une pièce portée par un compte. */
export const PORTEUR_COMPTE = 'App\\Models\\User';

/** Le prochain rappel à venir pour une pièce, au jour de Dakar `aujourdhui` ; `null` s'il n'en reste aucun. */
export function rappelAVenir(expiry: string | null | undefined, aujourdhui: string): JalonDuRappel | null {
  const echeance = echeanceDe(expiry ?? null, aujourdhui);
  if (echeance?.etat === 'plusTard') return 60;
  if (echeance?.etat === 'bientot' && echeance.jours > 7) return 7;
  return null;
}

/** La clé de `documents.coffre.marques` qui dit ce rappel. */
export const CLE_DE_LA_PROMESSE = { 60: 'nousPreviendrons', 7: 'nousPreviendronsSept' } as const satisfies Record<JalonDuRappel, string>;

/** La fiche d'une pièce : le lecteur la porte lui-même (« Mes pièces »). */
export function estDeMesPieces(
  document: { readonly documentable_type: string; readonly documentable_id: number },
  lecteurId: number | null | undefined,
): boolean {
  return lecteurId != null && document.documentable_type === PORTEUR_COMPTE && document.documentable_id === lecteurId;
}
