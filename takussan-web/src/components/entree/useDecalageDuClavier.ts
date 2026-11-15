'use client';

import { useEffect, useState } from 'react';

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
 * Sans `visualViewport` (navigateur ancien, jsdom), 0 : le pied reste en bas, comme avant.
 */
export function useDecalageDuClavier(): number {
  const [decalage, setDecalage] = useState(0);

  useEffect(() => {
    const vue = window.visualViewport;
    if (!vue) return;
    const mesurer = () => {
      const cache = Math.round(window.innerHeight - (vue.offsetTop + vue.height));
      // Un ou deux px d'arrondi (barre d'adresse qui se replie) ne sont pas un clavier.
      setDecalage(cache > 2 ? cache : 0);
    };
    mesurer();
    vue.addEventListener('resize', mesurer);
    vue.addEventListener('scroll', mesurer);
    return () => {
      vue.removeEventListener('resize', mesurer);
      vue.removeEventListener('scroll', mesurer);
    };
  }, []);

  return decalage;
}
