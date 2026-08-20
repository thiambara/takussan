'use client';

import { useState } from 'react';

/**
 * État local qui se resynchronise sur une valeur EXTERNE, sans `useEffect`.
 *
 * ## Le motif qu'il remplace (TCK-316)
 *
 * ```tsx
 * const [input, setInput] = useState(current);
 * useEffect(() => { setInput(current); }, [current]);   // ← react-hooks/set-state-in-effect
 * ```
 *
 * Ce `useEffect` est le cas d'école de « [You Might Not Need an
 * Effect](https://react.dev/learn/you-might-not-need-an-effect) » : il déclenche
 * un rendu, PUIS un effet, PUIS un second rendu — avec une frame peinte entre
 * les deux, pendant laquelle l'utilisateur voit l'ancienne valeur. L'ajustement
 * pendant le rendu, lui, rejoue le composant immédiatement, avant toute peinture.
 *
 * Ce n'est pas une astuce : React documente explicitement l'écriture d'un
 * `setState` pendant le rendu tant qu'elle est **conditionnelle et converge**,
 * ce qui est le cas ici (`external !== synced` devient faux au rendu suivant).
 *
 * ## Ce qu'il ne fait pas
 *
 * Il ne remplace pas un effet qui parle au monde extérieur (fetch, abonnement,
 * timer, mesure du DOM). Ceux-là sont des effets légitimes et le restent.
 *
 * @param external la valeur qui fait autorité (paramètre d'URL, prop, réponse serveur)
 * @returns le couple `[valeur, setter]` habituel — le setter reste libre entre
 *          deux changements de `external`, c'est tout l'intérêt d'un champ
 *          contrôlé qu'on peut taper
 */
export function useStateSyncedWith<T>(external: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(external);
  const [synced, setSynced] = useState<T>(external);

  if (!Object.is(external, synced)) {
    setSynced(external);
    setValue(external);
  }

  return [value, setValue];
}
