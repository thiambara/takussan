'use client';

import { useLayoutEffect } from 'react';

/**
 * Attribut de `body` qui porte, verrou posé, la position verticale RÉELLE du visiteur — TCK-551,
 * tour 3. Sous `position: fixed`, `window.scrollY` vaut 0 et le navigateur émet un `scroll` :
 * `useScrollRestoration` enregistrait ce 0 comme position de la liste, et une sortie menu ouvert
 * (geste retour d'Android, rechargement) la perdait. Mesuré à 390 × 844 : `{"y":0}` en mémoire
 * juste après l'ouverture, liste rendue à 0 au retour, contre 901 pour le témoin sans menu.
 */
export const ATTRIBUT_POSITION_VERROUILLEE = 'data-verrou-defilement-y';

/**
 * La position verticale du visiteur : celle que le verrou a mise de côté s'il est posé, sinon
 * `window.scrollY`. Tout code qui MÉMORISE une position de défilement la lit par ici.
 */
export function positionVerticale(): number {
  const publiee = document.body.getAttribute(ATTRIBUT_POSITION_VERROUILLEE);
  if (publiee !== null) {
    const y = Number(publiee);
    if (Number.isFinite(y)) return y;
  }
  return window.scrollY;
}

/**
 * Verrou de défilement du document, qui tient là où `overflow: hidden` ne tient pas — TCK-551.
 *
 * ## Pourquoi pas celui de base-ui
 *
 * Sur tout appareil à barres de défilement superposées — tous les mobiles, iOS compris —, le
 * verrou des `Dialog` de base-ui 1.7.0 se réduit à `overflow: hidden` sur l'élément qui porte le
 * défilement (`@base-ui/utils/useScrollLock.mjs` l. 50-71, choisi l. 247). Mesuré au navigateur
 * (Chrome, `mobile: true`, 390 × 844) : menu ouvert, `window.scrollBy(0, 500)` faisait passer
 * `scrollY` de 700 à 1200. Et le commentaire de base-ui l. 249-254 l'écrit lui-même : « on iOS,
 * scroll locking does not work if the navbar is collapsed ».
 *
 * ## Ce que fait celui-ci
 *
 * Il sort `body` du flux (`position: fixed`), décalé de la position de défilement courante : rien
 * ne bouge à l'écran, et le document n'a plus aucune hauteur à faire défiler — ni au doigt, ni
 * par programme, ni par Safari qui replie sa barre d'adresse. À la levée, les styles d'origine de
 * `body` sont rendus et la position aussi, en `behavior: 'instant'` : un `scroll-behavior: smooth`
 * ferait glisser la page de 0 à sa position sous les yeux du visiteur.
 *
 * ⚠ Ne pas l'empiler avec le verrou de base-ui : sur les barres INCRUSTÉES (bureau fenêtre
 * étroite, sans `scrollbar-gutter`), base-ui réécrit `body.style.position` en `relative`, puis
 * restaure à SA levée ce qu'il avait lu — ce `fixed`. Le `Dialog` qui s'en sert doit être en
 * `modal="trap-focus"` : piège du focus et `aria-hidden` du reste, sans le verrou de la primitive.
 *
 * ⚠ Verrou posé, `window.scrollY` vaut 0 : la position du visiteur se lit par `positionVerticale()`
 * (tour 3 — `useScrollRestoration` mémorisait ce 0).
 */
export function useVerrouDeDefilement(actif: boolean): void {
  useLayoutEffect(() => {
    if (!actif) return undefined;
    const style = document.body.style;
    const x = window.scrollX;
    const y = window.scrollY;
    const origine = { position: style.position, top: style.top, left: style.left, width: style.width };
    Object.assign(style, { position: 'fixed', top: `${-y}px`, left: `${-x}px`, width: '100%' });
    document.body.setAttribute(ATTRIBUT_POSITION_VERROUILLEE, String(y));
    return () => {
      document.body.removeAttribute(ATTRIBUT_POSITION_VERROUILLEE);
      Object.assign(style, origine);
      window.scrollTo({ left: x, top: y, behavior: 'instant' });
    };
  }, [actif]);
}
