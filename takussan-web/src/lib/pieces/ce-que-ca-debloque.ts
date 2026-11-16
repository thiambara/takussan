import type { CodeDePiece } from './pieces';

/**
 * TCK-2947 — « Ce que ça débloque » (aside de « Vos pièces » au bureau, maquette `app-entree-assistants` a-3) : ce
 * qu'une pièce OUVRE au profil. Une ligne n'est écrite que si une règle de l'API la tient — une route qui refuse, ou un
 * calcul qui écarte, faute de cette pièce. Chaque ligne cite sa règle (`regle`, fichier:ligne de `takussan-api/`) ;
 * son texte vit sous `pieces.debloque.<code>`.
 *
 * La liste est VIDE, et c'est une mesure (2026-11-15, relevée dans le ticket) — les deux lignes de la maquette ne sont
 * tenues par aucune règle :
 *  - « RIB — le reversement de tes loyers, le 10 de chaque mois » : un reversement se prépare et se paie sur une
 *    DESTINATION de paiement (`PayoutMethod`, vérifiée par un membre de l'agence — `PayoutPreparationService.php:89-101`,
 *    `PayoutMethodService.php`), jamais sur le RIB envoyé comme pièce (`DocumentType::Rib`, que seuls l'envoi et
 *    `PiecesDuProfil` lisent) ; et le jour du reversement est un réglage (`owner_profiles.payout_day`, 1 à 28, ou celui
 *    de l'agence — `PayoutMethodController.php:37-45`), pas « le 10 » ;
 *  - « Pièce d'identité — la signature de tes mandats et de tes baux » : la signature d'un bail ne lit aucune pièce
 *    (`LeaseSignatureService.php`, `LandlordSignatory.php`), et aucun mandat ne se signe en ligne.
 * Plus largement, « requise » ne bloque rien : aucune route ne refuse l'usage de l'espace faute de pièce
 * (`PiecesDuProfil.php`, en-tête). Le jour où une règle tiendra une ligne, elle s'ajoute ici avec sa citation, et
 * l'aside paraît pour les profils qui ont cette pièce.
 */
export interface LigneDeDeblocage {
  readonly code: CodeDePiece;
  /** La règle de l'API qui la tient, `fichier:ligne` sous `takussan-api/`. */
  readonly regle: string;
}

export const CE_QUE_CA_DEBLOQUE: readonly LigneDeDeblocage[] = [];

/** Les lignes à rendre pour les pièces de CE profil, dans l'ordre de la liste. */
export function lignesDeDeblocage(
  codesDuProfil: readonly string[],
  liste: readonly LigneDeDeblocage[] = CE_QUE_CA_DEBLOQUE,
): readonly LigneDeDeblocage[] {
  return liste.filter((l) => codesDuProfil.includes(l.code));
}
