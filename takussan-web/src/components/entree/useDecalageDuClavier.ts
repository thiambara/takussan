'use client';

import { useFenetre } from '@/lib/fenetre';

/**
 * TCK-2598 — la hauteur que le clavier du téléphone cache en bas de la fenêtre, en px (0 sans clavier).
 *
 * Le clavier ne réduit pas la fenêtre de mise en page (`innerHeight`) : Safari iOS, et Chrome Android
 * depuis la version 108, ne réduisent que la fenêtre VISUELLE (`visualViewport`). Un pied posé en
 * `bottom: 0` reste donc dessous. Ce qui en dépasse se lit ainsi :
 *
 *   caché = innerHeight − (visualViewport.offsetTop + visualViewport.height)
 *
 * `offsetTop` compte : clavier ouvert, le navigateur fait défiler la fenêtre visuelle pour montrer le
 * champ, et le bas visible n'est plus à `visualViewport.height`.
 *
 * ADR-0133 (TCK-2988) — la mesure vit dans `src/lib/fenetre.ts`, la seule de l'application ; ce crochet en lit
 * `cache`. Sans `visualViewport` (navigateur ancien, jsdom), 0 : le pied reste en bas, comme avant.
 */
export function useDecalageDuClavier(): number {
  const { cache } = useFenetre();
  // Un ou deux px d'arrondi (barre d'adresse qui se replie) ne sont pas un clavier.
  return cache > 2 ? cache : 0;
}
