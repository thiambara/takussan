/**
 * TCK-468 — la DENSITÉ DE CHAMP : une variante NOMMÉE, portée par une PORTÉE, pas par chaque appel.
 *
 * TCK-2460 — la hauteur de base est passée de `h-8` à `h-10` dans toutes les primitives, et `Button` s'y
 * aligne. Les hauteurs citées plus bas datent de TCK-468. Une hauteur de champ ne s'écrit jamais chez
 * l'appelant : `scripts/check-champs-uniformes.mjs`.
 *
 * TCK-2686 — **AMENDEMENT DE TCK-2460 par [ADR-0106](../../../../docs/adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)**
 * (décidé par le porteur le 2026-11-10) : il y a désormais DEUX RÉGIMES posés par un ancêtre, sur la
 * même idée que celle-ci (l'ancêtre choisit, l'appelant n'écrit rien).
 *   - **La portée `/app`** (`data-portee-app`, posée par la coque) : boutons ET champs à 44 px sous
 *     le pouce (48 l'action principale, 36 le petit bouton), `h-9` au bureau, et au pointeur grossier
 *     le régime du pouce à toute largeur. Elle passe par des JETONS (`h-controle`, `text-champ`…, bloc
 *     `densite-de-l-app` de `globals.css`), que la portée redéfinit — pas par une variante : un jeton
 *     cède à la hauteur qu'écrit un appelant, une variante l'aurait rabotée.
 *   - **La portée « confortable »** ci-dessous, inchangée dans son principe : 44 px (39,6 rendus au
 *     bureau), et elle GAGNE quand elle est posée sous la portée `/app` — sa classe est une variante,
 *     émise après la hauteur de base nue. Son jeton (`--spacing-controle-confortable`) suit le pouce :
 *     2,75rem fixes au pointeur grossier.
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
 * la forme simple. `SelectTrigger` écrivait `data-[size=default]:h-8` (0,2,0) — d'où
 * `FIELD_DENSITY_HEIGHT_SIZED`, qui empile les deux variantes pour retrouver (0,2,0) plus tard
 * dans la feuille. Ajouter un champ dont la hauteur de base est conditionnée demande le même soin.
 * (Depuis la revue du 2026-09-16, sa base est nue — `h-8` — pour que la hauteur d'un appelant
 * gagne ; la forme empilée reste, et bat aussi un `data-[size=default]:h-*` d'appelant.)
 */

/** Le seul régime déclaré à ce jour. Le régime par défaut est l'ABSENCE d'attribut. */
export type FieldDensity = 'comfortable';

/** Hauteur confortable (44 px) — pour une primitive dont la hauteur de base est nue (`h-8`). */
export const FIELD_DENSITY_HEIGHT = 'in-data-[field-density=comfortable]:h-controle-confortable';

/**
 * Même chose pour une primitive dont la hauteur de base vit déjà sous une variante
 * (`data-[size=default]:h-8`) : sans l'empilement, la règle de base gagne en spécificité.
 */
export const FIELD_DENSITY_HEIGHT_SIZED =
  'in-data-[field-density=comfortable]:data-[size=default]:h-controle-confortable';

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
