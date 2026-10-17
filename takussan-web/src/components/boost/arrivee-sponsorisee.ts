'use client';

import { createContext, useContext } from 'react';

/**
 * TCK-633 lot F (ADR-0061 §10) — un clic d'emplacement est une vue de fiche arrivée par un lien
 * sponsorisé.
 *
 * TCK-794 (P18.06, décision du porteur) — le marqueur est dans l'URL de la fiche (`?src=sponsored`).
 * Il était en `sessionStorage` : un clic du milieu ou « ouvrir dans un nouvel onglet » ouvre un
 * onglet qui ne lit pas le stockage de l'onglet d'origine, et le clic n'était pas compté.
 *
 * - Un emplacement pose {@link ArriveeSponsorisee} autour de ses cartes : `LienDeCarte` ajoute alors
 *   le marqueur à son lien. Le lien d'une carte ailleurs ne change pas.
 * - La fiche le lit une fois ({@link consommerArriveeDansLUrl}) et le retire de l'URL : un
 *   rechargement ou une URL copiée ne recompte pas de clic.
 */
export const PARAMETRE_ARRIVEE = 'src';
export const VALEUR_ARRIVEE = 'sponsored';

export const ArriveeSponsorisee = createContext(false);

export function useArriveeSponsorisee(): boolean {
  return useContext(ArriveeSponsorisee);
}

/** Le chemin de la fiche, marqué quand le lien sort d'un emplacement. */
export function hrefDeFiche(slug: string, sponsorise: boolean): string {
  const chemin = `/properties/${slug}`;
  return sponsorise ? `${chemin}?${PARAMETRE_ARRIVEE}=${VALEUR_ARRIVEE}` : chemin;
}

/** Vrai si la page courante est arrivée par un emplacement ; le marqueur est alors retiré de l'URL. */
export function consommerArriveeDansLUrl(): boolean {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get(PARAMETRE_ARRIVEE) !== VALEUR_ARRIVEE) return false;
    url.searchParams.delete(PARAMETRE_ARRIVEE);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    return true;
  } catch {
    // Un clic non compté n'est pas une panne.
    return false;
  }
}
