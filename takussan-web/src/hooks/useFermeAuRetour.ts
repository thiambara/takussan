'use client';

import { useEffect, useRef } from 'react';

/** La marque de l'entrée sentinelle dans `history.state` (une par surface ouverte, par son jeton). */
const MARQUE = '__takussanFermeAuRetour';

/**
 * TCK-2634 — le geste retour (Android, retour du navigateur) FERME une surface ouverte (la feuille des
 * notifications) au lieu de quitter la page dessous. Le mécanisme est celui du tiroir des filtres
 * (`FilterSidebar`, TCK-556), sans sa séance d'écriture :
 *
 * 1. **À l'ouverture, une entrée SENTINELLE** à la même URL (`pushState` direct : l'état de Next est
 *    recopié, `__NA` compris, donc le routeur la restaure comme la sienne). Le retour la dépile.
 * 2. **Au `popstate`**, la surface se ferme (`fermer`).
 * 3. **Toute autre fermeture** (✕, Échap, voile) rend la sentinelle par `history.back()`, DIFFÉRÉ d'une
 *    tâche (StrictMode démonte et remonte l'effet : le remontage annule le retour) et seulement si
 *    l'entrée courante est encore la nôtre — sinon quelqu'un a navigué depuis, et `back()` défairait
 *    sa navigation.
 * 3 bis. **« L'entrée courante est la nôtre »** ne se lit pas qu'à la marque : l'AppRouter de Next 16
 *    réécrit `history.state` à chaque rendu du routeur (`router.refresh()`, même URL) sans recopier les
 *    clés qu'il ne connaît pas, et la marque disparaît (TCK-2827). Une entrée SANS marque reste la nôtre
 *    si la pile n'a pas bougé depuis la sentinelle (même `history.length`) et l'adresse non plus : une
 *    navigation empile (longueur) ou remplace par une autre adresse — dans les deux cas, pas de `back()`.
 * 4. **Une fermeture PAR NAVIGATION** (une notification ouverte) appelle d'abord `garderLEntree()` :
 *    la navigation de Next s'écrit après la fermeture, et un `back()` pris entre les deux la
 *    défairait. La sentinelle reste alors sous la page ouverte — un retour de plus pour revenir.
 */
interface Sentinelle {
  readonly jeton: string;
  readonly longueur: number;
  readonly adresse: string;
}

/** L'entrée courante est-elle la sentinelle ? Sa marque, ou — marque effacée par le routeur — la même place et la même adresse. */
function estLaSentinelle(sentinelle: Sentinelle | null): boolean {
  if (sentinelle === null) return false;
  const marque = (window.history.state as Record<string, unknown> | null)?.[MARQUE];
  if (marque === sentinelle.jeton) return true;
  return window.history.length === sentinelle.longueur && window.location.href === sentinelle.adresse;
}

export function useFermeAuRetour(ouverte: boolean, fermer: () => void): { garderLEntree: () => void } {
  const rappel = useRef(fermer);
  useEffect(() => {
    rappel.current = fermer;
  });

  const sentinelle = useRef<Sentinelle | null>(null);
  const differe = useRef<number | null>(null);
  const garder = useRef(false);

  useEffect(() => {
    if (!ouverte) return;
    if (differe.current !== null) {
      window.clearTimeout(differe.current);
      differe.current = null;
    }
    garder.current = false;
    if (!estLaSentinelle(sentinelle.current)) {
      const etat = window.history.state as Record<string, unknown> | null;
      const marque = `retour-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      window.history.pushState({ ...etat, [MARQUE]: marque }, '', window.location.href);
      sentinelle.current = { jeton: marque, longueur: window.history.length, adresse: window.location.href };
    }

    let fermeParRetour = false;
    const surRetour = () => {
      fermeParRetour = true;
      sentinelle.current = null;
      rappel.current();
    };
    window.addEventListener('popstate', surRetour);

    return () => {
      window.removeEventListener('popstate', surRetour);
      if (fermeParRetour) return;
      const courante = sentinelle.current;
      differe.current = window.setTimeout(() => {
        differe.current = null;
        sentinelle.current = null;
        if (garder.current) return;
        if (estLaSentinelle(courante)) window.history.back();
      }, 0);
    };
  }, [ouverte]);

  return {
    garderLEntree: () => {
      garder.current = true;
    },
  };
}
