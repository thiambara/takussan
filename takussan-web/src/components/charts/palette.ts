/**
 * La palette de séries des graphiques — jetons `--chart-*` du design system, et rien d'autre
 * (TCK-374, complétée par TCK-404).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE, ET POURQUOI IL A EXCLU `--chart-3` PENDANT UNE JOURNÉE
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
 * Mesuré, c'était faux d'un jeton sur cinq.** `--chart-3` VALAIT `#c89a4a` en clair et rendait
 * **2,57:1** sur `--card` — moins bien qu'`emerald-500` qu'il était censé remplacer. En sombre
 * il était irréprochable (8,17:1 sur `#2a2018`) : le défaut était une propriété du THÈME CLAIR
 * seul, ce qui est exactement le genre d'écart qu'une palette employée « telle quelle » propage
 * sans bruit.
 *
 * ⚠⚠ **TOUT CE PARAGRAPHE EST AU PASSÉ DEPUIS TCK-404, et le temps des verbes est le sujet.**
 * Il a été écrit au PRÉSENT — « `--chart-3` vaut `#c89a4a` et rend 2,57:1 » — et il l'est resté
 * pendant que la valeur changeait. Un docblock qui énonce au présent une mesure invalidée est
 * exactement la documentation périmée dont ce dépôt paie le prix ailleurs : on ne s'en méfie
 * pas. La valeur courante et sa mesure sont plus bas, dans le bloc TCK-404 ; ici, seul le récit
 * de TCK-374.
 *
 * D'où la forme retenue par TCK-374 : l'ordre des séries n'était pas `1,2,3,4,5` mais `1,2,4,5`,
 * les quatre jetons qui atteignaient 3:1 dans LES DEUX thèmes.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * ⚠ **TCK-404 A CORRIGÉ LE JETON, ET L'ORDRE EST REDEVENU CELUI DE LA CHARTE (2026-08-27).**
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * La valeur claire de `--chart-3` est passée de `#c89a4a` à `#ad8034` — même teinte (38°), même
 * saturation (54 %), clarté HSL de 54 % à 44 %. Relevé complet, reproductible par
 * `node scripts/check-chart-contrast.mjs --report` :
 *
 *                clair (sur #ffffff)      sombre (sur #2a2018)
 *     --chart-1   #a85332   5,32:1  ✓      #c87a52   4,83:1  ✓
 *     --chart-2   #5d6e4f   5,51:1  ✓      #7d8d6e   4,48:1  ✓
 *     --chart-3   #ad8034   3,55:1  ✓      #d6b66c   8,17:1  ✓   ← corrigé (était 2,57:1)
 *     --chart-4   #6e655a   5,72:1  ✓      #b8aa97   7,01:1  ✓
 *     --chart-5   #1f1812  17,53:1  ✓      #fcf9f3  15,16:1  ✓
 *
 * ⚠ **Ce que la décision N'A PAS eu à arbitrer**, contrairement à ce que TCK-404 annonçait : le
 * ticket bloquait la correction sur un second rôle — « l'ambre sert aussi de fond, le ton
 * `warning` de `StatCard` le porte à 15 % ». Mesuré le jour de l'implémentation, c'est PÉRIMÉ :
 * TCK-381 a fait passer ce ton sur `--warning`, et `SURFACES` de la garde de contraste a perdu
 * son exemption `bg-chart-3/15` au même moment. Corriger la valeur ne cassait donc aucun second
 * usage — il n'y en avait plus. *Un ticket qui hérite d'un obstacle doit re-mesurer l'obstacle,
 * pas seulement le défaut.*
 *
 * ⚠ **L'ORDRE CHANGE CE QUE VOIT UN GRAPHIQUE À TROIS SÉRIES** : la troisième passe de
 * `--chart-4` (taupe) à `--chart-3` (ocre). C'est la restauration voulue — la charte se lit
 * `1,2,3,4,5` — mais ce n'est pas un changement neutre, et c'est pourquoi il est écrit ici.
 *
 * ⚠ **Cette table n'est plus le seul endroit mesuré, depuis la revue du 2026-08-27.**
 * `scripts/check-chart-contrast.mjs` lit désormais tout `components/charts` ET
 * `components/reporting` : les onze classes de jeton écrites en dur dans `TimeSeriesChart`,
 * `FunnelChart` et `StatCard` vivaient hors de sa portée, et le nom de la garde promettait plus
 * qu'elle ne tenait. Écrire un jeton de série ailleurs qu'ici reste une mauvaise idée — c'est une
 * table de plus à tenir alignée — mais ce n'est plus une façon d'échapper à la mesure. Ce qui n'est
 * PAS une série (un fond de tuile, un aplat sous une courbe) se déclare dans `SURFACES` de la
 * garde, avec sa mesure et sa raison.
 *
 * ⚠ Il reste UN consommateur de `--chart-3` hors des séries, trouvé en implémentant TCK-404 et
 * **non corrigé** : `components/profile/ProfileBadge.tsx` rend `bg-chart-3/20 text-chart-3` —
 * donc du TEXTE sur un aplat de lui-même. Mesuré : 2,17:1 avant la correction, 2,90:1 après.
 * Amélioré, toujours sous les 4,5:1 d'AA, et hors du périmètre de la garde de contraste (qui ne
 * lit que `components/charts` et `components/reporting`). Signalé, pas refermé.
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
 * L'ordre est celui de la charte, `1,2,3,4,5`, depuis que TCK-404 a corrigé `--chart-3`
 * (cf. en-tête). Ne pas réordonner sans remesurer : la position 1 est celle d'une série
 * solitaire, donc celle qu'on voit toujours.
 */
export const REMPLISSAGES_SERIE = [
  'fill-chart-1',
  'fill-chart-2',
  'fill-chart-3',
  'fill-chart-4',
  'fill-chart-5',
] as const;

/** Les traits de série (`LineChart`), même ordre et mêmes jetons. */
export const TRAITS_SERIE = [
  'stroke-chart-1',
  'stroke-chart-2',
  'stroke-chart-3',
  'stroke-chart-4',
  'stroke-chart-5',
] as const;

/** Les pastilles de légende, même ordre et mêmes jetons — la légende ment sinon. */
export const PASTILLES_LEGENDE = [
  'bg-chart-1',
  'bg-chart-2',
  'bg-chart-3',
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

/** Le remplissage de la série d'indice `idx` — cycle au-delà de cinq séries. */
export function remplissageSerie(idx: number): RemplissageSerie {
  return REMPLISSAGES_SERIE[indice(idx, REMPLISSAGES_SERIE.length)];
}

/** Le trait de la série d'indice `idx` — cycle au-delà de cinq séries. */
export function traitSerie(idx: number): TraitSerie {
  return TRAITS_SERIE[indice(idx, TRAITS_SERIE.length)];
}

/** La pastille de légende de la série d'indice `idx` — cycle au-delà de cinq séries. */
export function pastilleLegende(idx: number): PastilleLegende {
  return PASTILLES_LEGENDE[indice(idx, PASTILLES_LEGENDE.length)];
}

/**
 * Le modulo, mais qui rend toujours un indice VALIDE.
 *
 * `(-1) % 5` vaut `-1` en JavaScript, et `tableau[-1]` est `undefined` : une pastille sans classe,
 * donc une pastille invisible, sans que rien ne casse. Le repli explicite coûte une ligne et
 * supprime le cas.
 */
function indice(idx: number, taille: number): number {
  if (!Number.isFinite(idx)) return 0;
  return ((Math.trunc(idx) % taille) + taille) % taille;
}
