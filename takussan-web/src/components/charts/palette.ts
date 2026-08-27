/**
 * La palette de séries des graphiques — jetons `--chart-*` du design system, et rien d'autre
 * (TCK-374).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE, ET POURQUOI IL EXCLUT `--chart-3`
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `BarChart` et `LineChart` portaient chacun DEUX tables de couleurs écrites à la main — une pour
 * le remplissage ou le trait de la série, une pour la pastille de légende, sur la même palette
 * Tailwind brute en échelon 500 — quatre tables au total, qu'aucun mécanisme ne tenait alignées.
 * Contrastes mesurés le 2026-08-27 sur `--card` clair (`#ffffff`), seuil WCAG 1.4.11 = 3:1 pour un objet graphique
 * porteur de sens :
 *
 *     amber-500   #f59e0b   2,15:1   ✗
 *     emerald-500 #10b981   2,54:1   ✗
 *     sky-500     #0ea5e9   2,77:1   ✗
 *     rose-500    #f43f5e   3,67:1   ✓ (la seule qui passait)
 *
 * ⚠ **Le ticket supposait que « suivre la charte règle le contraste par la même occasion ».
 * Mesuré, c'est faux d'un jeton sur cinq.** `--chart-3` vaut `#c89a4a` en clair et rend
 * **2,57:1** sur `--card` — moins bien qu'`emerald-500` qu'il était censé remplacer. En sombre
 * il est irréprochable (8,17:1 sur `#2a2018`) : le défaut est une propriété du THÈME CLAIR seul,
 * ce qui est exactement le genre d'écart qu'une palette employée « telle quelle » propage sans
 * bruit.
 *
 * D'où la forme retenue : l'ordre des séries n'est pas `1,2,3,4,5` mais **`1,2,4,5`**, les quatre
 * jetons qui atteignent 3:1 dans LES DEUX thèmes. Relevé complet, `bin`-reproductible par le
 * script cité dans le rapport du ticket :
 *
 *                clair (sur #ffffff)      sombre (sur #2a2018)
 *     --chart-1   #a85332   5,32:1  ✓      #c87a52   4,83:1  ✓
 *     --chart-2   #5d6e4f   5,51:1  ✓      #7d8d6e   4,48:1  ✓
 *     --chart-3   #c89a4a   2,57:1  ✗      #d6b66c   8,17:1  ✓   ← écarté
 *     --chart-4   #6e655a   5,72:1  ✓      #b8aa97   7,01:1  ✓
 *     --chart-5   #1f1812  17,53:1  ✓      #fcf9f3  15,16:1  ✓
 *
 * Corriger `--chart-3` lui-même serait la vraie fin de course — c'est un jeton documenté, employé
 * ailleurs que dans les séries — mais c'est une décision de charte, pas un delta de ce ticket :
 * elle est portée par **TCK-404**. Tant qu'elle n'est pas prise, l'exclure ici est le seul moyen
 * que « la série est lisible » soit vrai plutôt que déclaré.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * ⚠ POURQUOI DES LITTÉRAUX ENTIERS ET JAMAIS `` `fill-chart-${n}` ``
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Tailwind v4 génère une classe en trouvant sa chaîne COMPLÈTE dans les sources. Une classe
 * assemblée à l'exécution (`` `fill-chart-${jeton}` ``) n'est jamais compilée : l'attribut est
 * bien posé sur le `<rect>`, le CSS n'existe pas, et le SVG retombe sur son `fill` par défaut —
 * du **noir**, sans erreur, sans avertissement, et invisible à `tsc` comme à ESLint. Les tables
 * ci-dessous s'écrivent donc en toutes lettres, et c'est la seule forme admise.
 */

/**
 * Les remplissages de série (`BarChart`), dans l'ordre d'attribution.
 *
 * L'ordre est celui de la charte moins `--chart-3` (cf. en-tête). Ne pas réordonner sans
 * remesurer : la position 1 est celle d'une série solitaire, donc celle qu'on voit toujours.
 */
export const REMPLISSAGES_SERIE = [
  'fill-chart-1',
  'fill-chart-2',
  'fill-chart-4',
  'fill-chart-5',
] as const;

/** Les traits de série (`LineChart`), même ordre et mêmes jetons. */
export const TRAITS_SERIE = [
  'stroke-chart-1',
  'stroke-chart-2',
  'stroke-chart-4',
  'stroke-chart-5',
] as const;

/** Les pastilles de légende, même ordre et mêmes jetons — la légende ment sinon. */
export const PASTILLES_LEGENDE = [
  'bg-chart-1',
  'bg-chart-2',
  'bg-chart-4',
  'bg-chart-5',
] as const;

export type RemplissageSerie = (typeof REMPLISSAGES_SERIE)[number];
export type TraitSerie = (typeof TRAITS_SERIE)[number];
export type PastilleLegende = (typeof PASTILLES_LEGENDE)[number];

/**
 * Ce qu'un appelant a le droit de passer dans `ChartSeries.color`.
 *
 * C'est ici que l'AC2 devient STRUCTURELLE plutôt que greppée : `color` était un `string` libre,
 * une couleur de palette brute écrite dans une page aurait traversé toutes les gardes du dépôt
 * sans qu'aucune ne la voie — le périmètre de `scripts/check-super-admin-tokens.mjs` s'arrête à la
 * console super-admin, et `check-app-tokens.mjs` ne connaît que le dialecte `--app-*`. Avec cette
 * union, `tsc` refuse la couleur brute au point d'appel.
 */
export type ChartSeriesColor = RemplissageSerie | TraitSerie;

/** Le remplissage de la série d'indice `idx` — cycle au-delà de quatre séries. */
export function remplissageSerie(idx: number): RemplissageSerie {
  return REMPLISSAGES_SERIE[indice(idx, REMPLISSAGES_SERIE.length)];
}

/** Le trait de la série d'indice `idx` — cycle au-delà de quatre séries. */
export function traitSerie(idx: number): TraitSerie {
  return TRAITS_SERIE[indice(idx, TRAITS_SERIE.length)];
}

/** La pastille de légende de la série d'indice `idx` — cycle au-delà de quatre séries. */
export function pastilleLegende(idx: number): PastilleLegende {
  return PASTILLES_LEGENDE[indice(idx, PASTILLES_LEGENDE.length)];
}

/**
 * Le modulo, mais qui rend toujours un indice VALIDE.
 *
 * `(-1) % 4` vaut `-1` en JavaScript, et `tableau[-1]` est `undefined` : une pastille sans classe,
 * donc une pastille invisible, sans que rien ne casse. Le repli explicite coûte une ligne et
 * supprime le cas.
 */
function indice(idx: number, taille: number): number {
  if (!Number.isFinite(idx)) return 0;
  return ((Math.trunc(idx) % taille) + taille) % taille;
}
