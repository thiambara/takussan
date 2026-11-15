/**
 * Le clic fantôme qui suit un choix dans un menu, au toucher.
 *
 * Contre-vérification de f02583f76 (verif-commercial, 2026-11-12) — liste des biens à 390 px : un
 * double appui sur une entrée du menu de ligne choisissait le statut au premier appui, qui ferme le
 * menu ; le second traversait la place libérée jusqu'au lien étiré de la carte du dessous et ouvrait
 * la fiche d'un AUTRE bien.
 *
 * Après un choix au pointeur, un clic sur un LIEN de la page dans les `delaiMs` qui suivent est avalé
 * en phase de capture sur le document — avant React et avant la navigation native. Ce qui n'est pas
 * un lien (un bouton, une case) passe ; un lien dans un dialogue ou un menu aussi : le choix vient
 * d'en ouvrir un (Archiver, Dépublier), et ce qu'on y touche est voulu. Un seul clic avalé, puis
 * l'écouteur se retire ; passé le délai, il se retire sans rien avaler.
 */
export const DELAI_DU_CLIC_FANTOME_MS = 400;

const HORS_DE_LA_PAGE = '[role="dialog"], [role="alertdialog"], [role="menu"]';

export function avalerLeClicFantome(delaiMs: number = DELAI_DU_CLIC_FANTOME_MS): void {
  if (typeof document === 'undefined') return;

  const avaler = (evenement: MouseEvent) => {
    const cible = evenement.target instanceof Element ? evenement.target : null;
    if (!cible?.closest('a[href]') || cible.closest(HORS_DE_LA_PAGE)) return;
    evenement.preventDefault();
    evenement.stopPropagation();
    retirer();
  };
  // Minuteur et retrait par les globaux, pas par `window` : le délai peut échoir après le démontage
  // de l'environnement (fin d'un test, CI du 2026-11-14 : « window is not defined » APRÈS 1743
  // fichiers verts). Sans document, il n'y a plus d'écouteur à retirer.
  const minuteur = setTimeout(() => retirer(), delaiMs);
  function retirer() {
    clearTimeout(minuteur);
    if (typeof document === 'undefined') return;
    document.removeEventListener('click', avaler, true);
  }
  document.addEventListener('click', avaler, true);
}
