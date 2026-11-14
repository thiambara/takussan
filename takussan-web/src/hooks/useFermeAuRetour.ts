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
 * 4. **Une fermeture PAR NAVIGATION** (une notification ouverte) appelle d'abord `garderLEntree()` :
 *    la navigation de Next s'écrit après la fermeture, et un `back()` pris entre les deux la
 *    défairait. La sentinelle reste alors sous la page ouverte — un retour de plus pour revenir.
 */
export function useFermeAuRetour(ouverte: boolean, fermer: () => void): { garderLEntree: () => void } {
  const rappel = useRef(fermer);
  useEffect(() => {
    rappel.current = fermer;
  });

  const jeton = useRef<string | null>(null);
  const differe = useRef<number | null>(null);
  const garder = useRef(false);

  useEffect(() => {
    if (!ouverte) return;
    if (differe.current !== null) {
      window.clearTimeout(differe.current);
      differe.current = null;
    }
    garder.current = false;
    const etat = window.history.state as Record<string, unknown> | null;
    if (jeton.current === null || etat?.[MARQUE] !== jeton.current) {
      jeton.current = `retour-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      window.history.pushState({ ...etat, [MARQUE]: jeton.current }, '', window.location.href);
    }

    let fermeParRetour = false;
    const surRetour = () => {
      fermeParRetour = true;
      jeton.current = null;
      rappel.current();
    };
    window.addEventListener('popstate', surRetour);

    return () => {
      window.removeEventListener('popstate', surRetour);
      if (fermeParRetour) return;
      const jetonCourant = jeton.current;
      differe.current = window.setTimeout(() => {
        differe.current = null;
        jeton.current = null;
        if (garder.current) return;
        const courant = window.history.state as Record<string, unknown> | null;
        if (jetonCourant !== null && courant?.[MARQUE] === jetonCourant) window.history.back();
      }, 0);
    };
  }, [ouverte]);

  return {
    garderLEntree: () => {
      garder.current = true;
    },
  };
}
