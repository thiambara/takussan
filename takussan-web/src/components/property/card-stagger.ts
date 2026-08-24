/**
 * Retard d'entrée d'une carte de bien — **borné**.
 *
 * Le retard s'écrivait `index * 60ms` sans plafond, sur des listes qui vont jusqu'à
 * `per_page` cartes. Or les deux animations d'entrée du dépôt (`fadeInUp` et
 * `cardEnter`, `src/app/globals.css`) sont déclarées en `both` : pendant tout le
 * retard, la carte est **maintenue** à `opacity: 0`. Sur `/properties?per_page=30`,
 * la carte d'index 29 attendait donc 1 740 ms *après être entrée dans le viewport*.
 *
 * **Mesuré le 2026-08-24**, viewport 1249 × 695, défilement rapide jusqu'en bas de
 * `/properties?per_page=30`, échantillonnage de `getComputedStyle(carte).opacity` :
 *
 * | t après le défilement | opacité des cartes visibles |
 * |---|---|
 * | 1 ms → 1 629 ms | `0`, `0` |
 * | 1 881 ms | `0.32`, `0.14` |
 *
 * C'est ce qu'on décrit comme « les images se rechargent quand je scrolle vite ».
 * Elles ne se rechargent pas : sur six aller-retours haut↔bas, `performance
 * .getEntriesByType('resource')` compte **30 requêtes avant et 30 après**. Les
 * images sont là — la carte qui les porte est transparente.
 *
 * **Pourquoi un plafond plutôt qu'une autre formule.** `PropertyCard` révèle chaque
 * carte par `IntersectionObserver` : l'animation démarre au moment où la carte
 * entre à l'écran, qui n'a aucun rapport avec sa position dans la liste. L'index
 * global ne décrit donc plus rien passé la première peinture — il ne reste que son
 * coût. Le plafond garde l'échelonnement là où il a été conçu (les premières cartes,
 * peintes ensemble) et le neutralise au-delà.
 *
 * ⚠ Ne pas remplacer par `index % COLONNES` : le nombre de colonnes change à chaque
 * palier (2 → 3 → 4 → 5 sur la grille de recherche) et n'est pas connu de la carte.
 * Un modulo sur la mauvaise valeur rend un ordre d'apparition arbitraire *dans* une
 * rangée, ce qui est plus visible qu'un palier commun.
 */

/** Pas entre deux cartes consécutives. Inchangé — c'est le plafond qui manquait. */
export const STAGGER_STEP_MS = 60;

/** Nombre de pas au-delà duquel le retard n'augmente plus (→ 300 ms au maximum). */
export const STAGGER_MAX_STEPS = 5;

/**
 * Rend la valeur de `animation-delay` d'une carte d'index donné.
 *
 * @param index position 0-based dans la liste rendue.
 */
export function staggerDelay(index: number): string {
  return `${Math.min(Math.max(index, 0), STAGGER_MAX_STEPS) * STAGGER_STEP_MS}ms`;
}
