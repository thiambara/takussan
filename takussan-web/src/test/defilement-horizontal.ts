/**
 * Harnais de test — l'invariant de structure qui rend une table LARGE défilante sur mobile.
 *
 * jsdom n'a aucun moteur de mise en page : `scrollWidth` et `getBoundingClientRect()` y valent 0.
 * Aucun test ne peut donc affirmer « à 390 px, la table défile ». Ce qui EST gardable, c'est la
 * structure qui rend ce défilement possible — et c'est exactement ce qui avait cassé (TCK-505,
 * défaut #5, quatre tables sous `overflow-hidden`) : en remontant depuis la `<table>` vers la
 * racine, on doit rencontrer un conteneur qui DÉFILE avant tout conteneur qui ROGNE.
 *
 * ⚠ « Défile » est une PROPRIÉTÉ CSS, pas un littéral. Le modèle ci-dessous est celui de
 * `admin/__tests__/console-agence-a11y.test.tsx` (TCK-371) : la valeur de l'axe X est lue quelle
 * que soit l'écriture (`overflow-auto`, `overflow-x-scroll`, `style=`…), et CSS Overflow 3 §3 est
 * respecté (un axe `visible` calcule `auto` dès que l'autre ne l'est pas). Sans ce modèle, réécrire
 * `overflow-x-auto` en `overflow-auto` — un changement équivalent — ferait un faux rouge, et la
 * réponse humaine à un rouge injuste est de désarmer le test.
 */

type ValeurOverflow = 'visible' | 'auto' | 'scroll' | 'hidden' | 'clip';

const VALEURS: ReadonlySet<string> = new Set(['visible', 'auto', 'scroll', 'hidden', 'clip']);

/** Valeur d'`overflow-x` calculée pour un élément : `style=` d'abord, puis les utilitaires Tailwind. */
export function overflowHorizontal(element: HTMLElement): ValeurOverflow {
  const enLigne = element.style.overflowX || element.style.overflow;
  if (enLigne && VALEURS.has(enLigne)) return enLigne as ValeurOverflow;

  let x: ValeurOverflow | null = null;
  let y: ValeurOverflow | null = null;
  for (const classe of Array.from(element.classList)) {
    const m = /^overflow(-[xy])?-([a-z]+)$/.exec(classe);
    if (!m || !VALEURS.has(m[2])) continue;
    const valeur = m[2] as ValeurOverflow;
    if (m[1] === '-y') y = valeur;
    else {
      x = valeur;
      if (m[1] === undefined) y = valeur;
    }
  }
  if (x !== null && x !== 'visible') return x;
  if (y !== null && y !== 'visible') return 'auto';
  return x ?? 'visible';
}

/**
 * Le premier ancêtre de `table` (jusqu'à `racine` incluse) dont l'axe X défile, ou `null` si un
 * ancêtre qui ROGNE est rencontré avant — ou si aucun ne défile. Dans les deux cas « null », les
 * colonnes de droite sont inaccessibles sur un viewport plus étroit que la table.
 */
export function conteneurDefilant(table: HTMLElement, racine: HTMLElement): HTMLElement | null {
  let noeud = table.parentElement;
  while (noeud) {
    const valeur = overflowHorizontal(noeud);
    if (valeur === 'auto' || valeur === 'scroll') return noeud;
    if (valeur === 'hidden' || valeur === 'clip') return null;
    if (noeud === racine) break;
    noeud = noeud.parentElement;
  }
  return null;
}

/**
 * Vrai si l'élément porte AUSSI un utilitaire qui rogne l'axe X. `overflow-hidden overflow-x-auto`
 * défile en pratique (Tailwind v4 émet la propriété longue après la courte), mais c'est une
 * cascade accidentelle : la lecture de la classe ne dit plus ce que la boîte fait, et un
 * `cn()` réordonné ou un `twMerge` peut inverser le résultat. Le conteneur ne doit porter que le
 * défilement.
 */
export function porteUnRognageHorizontal(element: HTMLElement): boolean {
  return Array.from(element.classList).some((classe) => /^overflow(-x)?-(hidden|clip)$/.test(classe));
}
