/**
 * Cibles tactiles des écrans d'authentification (revue design du 2026-09-16).
 *
 * Mesuré au banc à 390 px : l'œil « Afficher le mot de passe » tenait 20 × 16 px, les liens
 * « Mot de passe oublié ? », « S'inscrire », « Retour à la connexion » 16 à 18 px de haut — sous
 * les 24 px de WCAG 2.2 §2.5.8, et loin des 44 px d'un pouce. Deux formes, et deux seulement :
 */

/**
 * Lien EN LIGNE (dans une phrase ou à côté d'un libellé) : la zone de clic est étendue par un
 * pseudo-élément, sans toucher à la mise en page — un `padding` pousserait la ligne.
 */
export const CIBLE_LIEN_EN_LIGNE =
  "relative rounded-sm after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Bascule d'affichage du mot de passe, posée dans le `trailing` d'un champ de 44 px : un carré de
 * 40 px, centré dans la hauteur du champ.
 */
export const BASCULE_MOT_DE_PASSE =
  'flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';
