/**
 * TCK-468 — la DENSITÉ DE CHAMP : une variante NOMMÉE, portée par une PORTÉE, pas par chaque appel.
 *
 * ## L'arbitrage
 *
 * Les pastilles du parcours de publication tiennent 44 px (`min-h-11`, `ChoiceChips`), les champs
 * `Input` / `SelectTrigger` / `DatePicker` en font 32. TCK-464 avait laissé l'écart ouvert faute
 * de troisième voie : **aligner globalement** touchait les ~110 pages du parc pour le besoin de
 * deux écrans, **corriger localement** demandait de répéter la même classe sur chaque champ — et
 * restait incomplet, `date-picker.tsx` ne transmettant même pas son `className` à sa cible
 * cliquable.
 *
 * La troisième voie est celle-ci : **la primitive connaît les deux régimes, et c'est l'ANCÊTRE qui
 * choisit.** Le formulaire pose `data-field-density="comfortable"` une fois sur sa racine ; chaque
 * champ rendu dessous passe à 44 px sans que son appelant n'écrive quoi que ce soit. Le reste du
 * parc, qui ne pose pas l'attribut, ne bouge pas d'un pixel — la variante `in-*` de Tailwind ne
 * s'applique qu'à l'intérieur d'un ancêtre qui la déclare.
 *
 * ## Pourquoi ça vaut mieux qu'une prop `size`
 *
 * Une prop se PASSE, donc elle s'OUBLIE : le champ ajouté demain au parcours repartirait à 32 px,
 * et rien ne le dirait. Un attribut hérité par la cascade ne s'oublie pas — il faudrait sortir le
 * champ de la portée, ou écrire une hauteur en dur, pour le perdre. C'est ce second cas que garde
 * `property-form/__tests__/cibles-tactiles.test.tsx`.
 *
 * ## La mécanique CSS, mesurée (tailwindcss 4.2.2, la version du dépôt)
 *
 * `in-data-[field-density=comfortable]:h-11` compile en
 * `:where(*[data-field-density="comfortable"]) .in-data-\[…\]\:h-11 { height: 2.75rem }`.
 * Le `:where()` ne pèse rien : la règle a la MÊME spécificité (0,1,0) que le `.h-8` de base, et
 * ne l'emporte que par l'ORDRE SOURCE — Tailwind émet les utilitaires à variante après les
 * utilitaires nus. C'est vérifié, pas supposé.
 *
 * ⚠ Corollaire : une hauteur de base posée sous une variante plus spécifique n'est PAS battue par
 * la forme simple. `SelectTrigger` écrit `data-[size=default]:h-8` (0,2,0) — d'où
 * `FIELD_DENSITY_HEIGHT_SIZED`, qui empile les deux variantes pour retrouver (0,2,0) plus tard
 * dans la feuille. Ajouter un champ dont la hauteur de base est conditionnée demande le même soin.
 */

/** Le seul régime déclaré à ce jour. Le régime par défaut est l'ABSENCE d'attribut. */
export type FieldDensity = 'comfortable';

export const FIELD_DENSITY_ATTRIBUTE = 'data-field-density';

/** Hauteur confortable (44 px) — pour une primitive dont la hauteur de base est nue (`h-8`). */
export const FIELD_DENSITY_HEIGHT = 'in-data-[field-density=comfortable]:h-11';

/**
 * Même chose pour une primitive dont la hauteur de base vit déjà sous une variante
 * (`data-[size=default]:h-8`) : sans l'empilement, la règle de base gagne en spécificité.
 */
export const FIELD_DENSITY_HEIGHT_SIZED =
  'in-data-[field-density=comfortable]:data-[size=default]:h-11';

/**
 * Ouvre la portée sur l'élément qui la reçoit — à SPREADER sur un élément DÉJÀ présent
 * (`<form {...fieldDensityScope()}>`), jamais à envelopper dans un `<div>` de plus : la chaîne
 * flex du parcours (`h-full min-h-0`) ne survit pas à un nœud intercalé, et l'AC3 porte
 * précisément sur la mise en page.
 */
export function fieldDensityScope(density: FieldDensity = 'comfortable'): {
  readonly 'data-field-density': FieldDensity;
} {
  return { 'data-field-density': density };
}
