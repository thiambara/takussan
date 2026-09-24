import { destinationPublique } from './lien-connexion';

/**
 * La dernière page du site public vue DANS CET ONGLET — le repli du retour des écrans de
 * connexion (TCK-568, M2, revue du 2026-09-23).
 *
 * Pourquoi une mémoire : le retour ne peut suivre l'historique que si l'entrée précédente est une
 * page publique, et le navigateur ne le dit pas toujours. Sans Navigation API, aucune entrée ne se
 * lit ; après une déconnexion, l'entrée précédente est la console. Le lien de repli menait alors
 * à l'ACCUEIL — c'est-à-dire exactement la plainte du testeur, arrivé depuis WhatsApp.
 *
 * `sessionStorage` et non `localStorage` : la mémoire vaut pour l'onglet où l'on cherchait, pas
 * pour une visite d'il y a trois jours. Elle peut manquer (navigation privée, stockage bloqué) :
 * chaque accès est gardé, et son absence ramène au repli d'avant — l'accueil.
 */
export const CLE_PAGE_PUBLIQUE = 'takussan:derniere-page-publique';

export function memoriserPagePublique(chemin: string): void {
  if (destinationPublique(chemin) === null) return;
  try {
    window.sessionStorage.setItem(CLE_PAGE_PUBLIQUE, chemin);
  } catch {
    // Stockage indisponible : le retour retombera sur l'accueil, comme avant.
  }
}

/**
 * La page mémorisée, REFILTRÉE à la lecture : le stockage est modifiable par n'importe quel script
 * de la même origine, et ce qu'il rend devient un `href`.
 */
export function pagePubliqueMemorisee(): string | null {
  try {
    return destinationPublique(window.sessionStorage.getItem(CLE_PAGE_PUBLIQUE));
  } catch {
    return null;
  }
}
