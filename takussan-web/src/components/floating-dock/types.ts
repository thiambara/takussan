/**
 * TCK-275 — Floating Dock orchestrator types.
 * TCK-477 — la zone sûre iOS cesse d'être déléguée par un commentaire.
 */

/**
 * Where on the bottom edge an element anchors.
 *
 * - `bottom-right` — pinned to the bottom-right corner. Multiple slots stack
 *   vertically by ascending priority (lowest priority = closest to the floor).
 * - `bottom-full` — full-width sticky bar that touches the floor (e.g. the
 *   `PropertyMobileBottomBar`). Its presence shifts every `bottom-right`
 *   slot above its height so they never get hidden behind it.
 */
export type DockCorner = 'bottom-right' | 'bottom-full';

/**
 * Expression CSS de rembourrage bas d'une barre pleine largeur.
 *
 * Le type de motif exige littéralement `env(safe-area-inset-bottom)` dans la
 * chaîne : `tsc` refuse `'0.75rem'`, refuse une variable de type `string`, et
 * refuse l'absence du champ. C'est le point de bascule de TCK-477 — l'exigence
 * n'est plus une phrase dans un commentaire, c'est une condition de
 * compilation.
 */
export type SafeAreaInsetExpression = `${string}env(safe-area-inset-bottom)${string}`;

/** Champs communs à tous les slots, quel que soit le coin revendiqué. */
type FloatingDockSlotConfigBase = {
  /** Stable identity. Used as the registry key — must be unique across slots. */
  id: string;
  /**
   * Numeric priority for `bottom-right` slots. Lowest priority sits on the
   * floor, higher priorities stack on top. Defaults to `0`.
   */
  priority?: number;
  /**
   * Logical height of the slot in pixels. Used to push neighbouring slots
   * away. This is intentionally a static value (set by the consumer) rather
   * than a measured one — keeps positioning deterministic, side-steps any
   * FOUC during hydration, and avoids tight coupling to a `ResizeObserver`.
   */
  height: number;
  /**
   * Whether the slot is currently visible. When `false` the slot is treated
   * as if it never registered (no contribution to neighbour offsets).
   * Defaults to `true`.
   */
  enabled?: boolean;
};

/**
 * Public configuration accepted by the `useFloatingDockSlot` hook.
 *
 * ## TCK-477 — LA DÉCISION, écrite ici parce que c'est son absence qui a produit le défaut
 *
 * **L'encart de zone sûre iOS reste la responsabilité du CONSOMMATEUR** — mais il cesse
 * d'être délégué à sa bonne volonté : le consommateur ne peut plus revendiquer
 * `bottom-full` sans le déclarer, et ce qu'il déclare est ce qui lui est rendu.
 *
 * Pourquoi le consommateur et non l'orchestrateur, en trois faits mesurés :
 *
 * 1. **L'orchestrateur ne rend qu'un `bottom`, et `bottom` est le mauvais levier.**
 *    Une barre pleine largeur a un fond et une bordure haute ; la décoller du sol de
 *    la hauteur de l'encoche ouvrirait une bande transparente sous elle, laissant voir
 *    la page défiler dessous. L'encart correct est un rembourrage INTÉRIEUR.
 * 2. **Le dock possède la position, pas le balisage** (décision de TCK-275, en tête de
 *    `FloatingDockProvider`). Il ne rend aucun DOM ; il ne peut donc pas poser un
 *    rembourrage sur un élément qu'il ne dessine pas.
 * 3. **La composition dépend du consommateur, et la forme naïve est un piège MESURÉ**
 *    (TCK-453) : la barre porte déjà `py-3`, et `padding-bottom: env(safe-area-inset-bottom)`
 *    seul REMPLACE ces 12 px au lieu de s'y ajouter — sur tout appareil sans encoche
 *    `env()` vaut `0px`, et l'iOS corrigé casse tout le reste. Seul le consommateur
 *    connaît son propre rembourrage : `calc(0.75rem + env(safe-area-inset-bottom))`.
 *
 * Ce que la délégation coûtait jusqu'ici : rien ne vérifiait qu'elle soit honorée. La
 * classe citée en preuve (`safe-area-bottom`) n'a jamais existé — trois endroits y
 * croyaient, zéro l'implémentait (TCK-453). D'où le contrat ci-dessous.
 */
export type FloatingDockSlotConfig =
  | (FloatingDockSlotConfigBase & {
      corner: 'bottom-right';
      /**
       * Un slot d'angle ne touche pas le bord bas de l'écran : l'orchestrateur le
       * décale lui-même d'au moins `--floating-dock-base` (16 px), au-dessus de
       * l'indicateur d'accueil. Le champ est donc ABSENT ici, pas facultatif —
       * c'est le témoin légitime de TCK-477 : `bottom-right` ne doit pas payer
       * l'exigence de `bottom-full`.
       */
      safeAreaInset?: never;
    })
  | (FloatingDockSlotConfigBase & {
      corner: 'bottom-full';
      /**
       * OBLIGATOIRE. Le rembourrage bas que le consommateur applique à sa barre,
       * encoche COMPRISE — il est rendu tel quel par le hook sous
       * `FloatingDockSlotResult.paddingBottom`, et c'est ce qui lie la déclaration
       * au geste : la valeur déclarée est la valeur appliquée, il n'y a pas deux
       * sources.
       *
       * @example 'calc(0.75rem + env(safe-area-inset-bottom))'
       */
      safeAreaInset: SafeAreaInsetExpression;
    });

/** Internal record stored in the dock's registry. */
export type FloatingDockSlot = {
  id: string;
  corner: DockCorner;
  priority: number;
  height: number;
};

/** Return value of the `useFloatingDockSlot` hook. */
export type FloatingDockSlotResult = {
  /**
   * Pre-formatted CSS `bottom` value that the consumer applies on its fixed
   * wrapper. Includes the responsive base offset via the
   * `--floating-dock-base` CSS variable (16px on small screens, 24px on
   * `sm:`+).
   */
  bottom: string;
  /**
   * Rembourrage bas à poser sur la barre, pour un slot `bottom-full` uniquement
   * (`undefined` pour `bottom-right`, qui ne touche pas le bord).
   *
   * C'est l'écho exact de `config.safeAreaInset`. Le passe-plat est VOULU : sa
   * valeur n'est pas le calcul — il n'y en a aucun — c'est le couplage. Le
   * consommateur n'a aucune raison d'écrire la valeur deux fois, donc déclarer
   * et appliquer deviennent le même geste, et l'écart entre les deux (le défaut
   * d'origine) n'a plus d'endroit où se loger.
   */
  paddingBottom?: string;
};
