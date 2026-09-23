'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

/** Clé posée dans `history.state` par l'entrée sentinelle du menu mobile (TCK-551). */
export const MARQUE_MENU_MOBILE = '__takussanMenuMobile';

/**
 * Le geste retour FERME le menu mobile au lieu de quitter la page — TCK-551, tour 4.
 *
 * Mesuré avant (`/fr/agents` à 360 × 740, défilée à 1200, menu ouvert, `history.back()`) : la page
 * PRÉCÉDENTE s'affichait, menu démonté. Sur Android, le geste retour — le réflexe pour fermer un
 * panneau, que l'Objectif du ticket nomme — faisait quitter la page.
 *
 * Même mécanisme que le tiroir de filtres (`TiroirMobile`, `FilterSidebar.tsx`, TCK-556), dupliqué
 * ici plutôt que partagé : le tiroir porte en plus une séance qui écrit dans l'historique, le menu
 * n'y écrit jamais.
 *
 * 1. **À l'ouverture, une entrée SENTINELLE** à la même URL, par `pushState` direct : l'état de
 *    Next est recopié (`__NA`), donc le routeur ne la voit pas comme une navigation.
 *    ⚠ Posée dans un effet de MISE EN PAGE, et le hook appelé AVANT `useVerrouDeDefilement` : le
 *    navigateur enregistre la position de l'entrée qu'on quitte au `pushState`, et il doit y lire
 *    la vraie — pas le 0 du verrou. C'est elle qu'il rend quand on revient dessus.
 * 2. **Au `popstate`**, le navigateur a déjà ramené l'entrée d'avant le menu : `surRetour` ferme,
 *    rien d'autre.
 * 3. **Toute autre fermeture** (croix, Échap, voile, lien vers la page courante) rend la
 *    sentinelle par `history.back()`, sans quoi elle resterait comme un appui perdu.
 * 4. **Un lien du menu qui navigue** ne doit NI être défait par ce `back()` NI laisser la
 *    sentinelle derrière lui : il navigue en REMPLAÇANT la sentinelle (`replace`), et appelle
 *    `remplaceeParUneNavigation()` AVANT de fermer — la navigation de Next est asynchrone, un
 *    `back()` différé d'une tâche passerait avant elle, puis son `replaceState` écraserait l'entrée
 *    d'avant le menu. `history.length` reste ainsi celui d'une navigation sans menu.
 *
 * ⚠ **StrictMode** monte, démonte et remonte l'effet : la sentinelle porte un jeton propre, qui
 * empêche le remontage d'en poser une seconde, et le `history.back()` du démontage est DIFFÉRÉ
 * d'une tâche pour que le remontage puisse l'annuler. On ne dépile QUE notre sentinelle : si
 * l'entrée courante ne la porte plus, quelqu'un d'autre a navigué, et `back()` défairait sa
 * navigation.
 */
export function useEntreeSentinelle(ouvert: boolean, surRetour: () => void): {
  readonly remplaceeParUneNavigation: () => void;
} {
  const rappel = useRef(surRetour);
  useEffect(() => {
    rappel.current = surRetour;
  });

  const jeton = useRef<string | null>(null);
  const rendreDiffere = useRef<number | null>(null);
  const remplacee = useRef(false);

  useLayoutEffect(() => {
    if (!ouvert) return undefined;
    if (rendreDiffere.current !== null) {
      window.clearTimeout(rendreDiffere.current);
      rendreDiffere.current = null;
    }
    const etat = window.history.state as Record<string, unknown> | null;
    if (jeton.current === null || etat?.[MARQUE_MENU_MOBILE] !== jeton.current) {
      jeton.current = `menu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      remplacee.current = false;
      window.history.pushState({ ...etat, [MARQUE_MENU_MOBILE]: jeton.current }, '', window.location.href);
    }

    let fermeParRetour = false;
    const surPopState = () => {
      fermeParRetour = true;
      rappel.current();
    };
    window.addEventListener('popstate', surPopState);

    return () => {
      window.removeEventListener('popstate', surPopState);
      if (fermeParRetour || remplacee.current) return;
      const jetonCourant = jeton.current;
      rendreDiffere.current = window.setTimeout(() => {
        rendreDiffere.current = null;
        const courant = window.history.state as Record<string, unknown> | null;
        if (courant?.[MARQUE_MENU_MOBILE] === jetonCourant) window.history.back();
      }, 0);
    };
  }, [ouvert]);

  const remplaceeParUneNavigation = useCallback(() => {
    remplacee.current = true;
  }, []);

  return { remplaceeParUneNavigation };
}
