import { useState } from 'react';

/**
 * Vrai dès que `open` l'a été une fois — TCK-1041 (P70.04), patron de TCK-850.
 *
 * Un dialogue chargé par `next/dynamic` n'est téléchargé qu'au moment où il est rendu : le rendre
 * sous `useDejaOuvert(open)` le sort du JS initial de l'écran, et le garde monté après sa première
 * fermeture, pour que celle-ci garde son animation.
 */
export function useDejaOuvert(open: boolean): boolean {
  const [ouvert, setOuvert] = useState(open);
  if (open && !ouvert) setOuvert(true);
  return ouvert || open;
}
