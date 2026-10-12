/**
 * TCK-633 lot F (ADR-0061 §10) — un clic d'emplacement est une vue de fiche arrivée par un lien
 * sponsorisé. Le lien de la carte n'est pas touché (une carte sert partout) : l'emplacement note
 * le slug ici, et le compteur de vue de la fiche le CONSOMME une fois. Stockage de session, lu et
 * écrit sous `try` : un navigateur qui le refuse perd un clic, rien d'autre.
 */
const CLE = 'takussan:arrivee-sponsorisee';

export function marquerArriveeSponsorisee(slug: string): void {
  try {
    sessionStorage.setItem(CLE, slug);
  } catch {
    // Stockage refusé (navigation privée, quota) : un clic non compté n'est pas une panne.
  }
}

export function consommerArriveeSponsorisee(slug: string): boolean {
  try {
    if (sessionStorage.getItem(CLE) !== slug) return false;
    sessionStorage.removeItem(CLE);
    return true;
  } catch {
    return false;
  }
}
