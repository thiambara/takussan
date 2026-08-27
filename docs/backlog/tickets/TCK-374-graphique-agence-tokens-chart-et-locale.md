---
id: TCK-374
title: "Graphique agence — palette `--chart-*` et locale active au lieu de `'fr'`"
status: todo
phase: P2
family: front
estimate: S
wave: 47
created: 2026-08-26
updated: 2026-08-26
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#28-internationalisation--préférences
tags: [front, admin, charts, i18n, design-system]
---

## Objectif utilisateur

L'admin d'agence lit un graphique aux couleurs de son produit, et voit ses montants et ses nombres dans la langue qu'il a choisie.

## Contexte

**La palette.** `BarChart.tsx:128` — le seul graphique du tableau de bord agence :

```js
const palette = ['fill-emerald-500', 'fill-sky-500', 'fill-amber-500', 'fill-rose-500'];
```

Le dépôt définit `--chart-1` … `--chart-5`, en Lin, **déclinés en clair et en sombre**. Ils ne
sont pas employés. Contraste des barres sur la carte blanche, calculé le 2026-08-26 :
**amber-500 → 2,15:1**, **emerald-500 → 2,54:1**, **sky-500 → 2,77:1** — sous le seuil de 3:1
que WCAG 1.4.11 pose pour un objet graphique porteur de sens. L'axe est par ailleurs figé en
`toLocaleString('fr-FR')`.

**La locale.** 12 appels `formatNumber` / `formatCurrency` / `formatPercent(…, 'fr')` et 9
`'fr-FR'` sur la surface `/admin`. Le cas le plus parlant est `AgencyRevenueSnapshot.tsx` : il
porte un long commentaire TCK-292 expliquant pourquoi les mois de l'axe ont été rebranchés sur
`useLocale()` — et **six lignes plus bas**, `formatCurrency(total, 'fr')`. La correction s'est
arrêtée à l'axe qu'elle regardait.

## Contrat de données

Aucun. Les séries sont déjà servies par `/api/dashboard/agency`.

## Direction UX / Artistique

Un graphique de back-office n'a pas besoin de quatre couleurs vives : il a besoin d'une série
lisible. La charte fournit déjà l'échelle ; la suivre suffit, et elle règle le contraste par la
même occasion.

## Contraintes strictes (métier)

- Les couleurs de série passent par `--chart-*`, en clair **et** en sombre.
- Le formatage suit la locale active, jamais une locale écrite dans le code — la règle vaut
  pour l'axe comme pour les totaux, les montants, les pourcentages et les dates.
- Le composant est partagé : il sert aussi `/app/overview/*`. Le changement se propage, et
  c'est voulu.

## Delta à produire

- [ ] Palette des séries et de la légende sur `--chart-*`
- [ ] Axe, totaux et libellés du graphique sur la locale active
- [ ] Les 12 `'fr'` et 9 `'fr-FR'` de la surface `/admin` remplacés par la locale active
- [ ] Tests : au moins un qui rend dans une locale non française et **échouerait** si `'fr'`
      revenait

## Critères d'acceptation

- [ ] AC1 — `grep -rnE "'fr'|'fr-FR'"` sur la surface `/admin` et sur `src/components/charts`
      ne renvoie aucun appel de formatage
- [ ] AC2 — `grep -rE '(fill|bg|stroke)-(emerald|sky|amber|rose)-[0-9]+' src/components/charts`
      ne renvoie aucun résultat
- [ ] AC3 — le contraste de chaque couleur de série sur `--card` est **calculé et reporté dans
      la PR**, en clair et en sombre, et atteint 3:1
- [ ] AC4 — un test rend le tableau de bord en `en` et vérifie un nombre formaté à l'anglaise ;
      il échoue si on rétablit `'fr'` (vérification par ablation)
- [ ] AC5 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent

## Hors périmètre

- Enrichir le graphique (infobulles, comparaison de période, second axe) — le tableau de bord
  agence relève de TCK-375, et les rapports plateforme de TCK-361.
- Les locales codées en dur ailleurs que sur la surface `/admin` et les graphiques.

## Notes d'implémentation

**Quatre affirmations du ticket ont été contredites par la mesure du 2026-08-27.**

1. **« Les jetons `--chart-*` ne sont pas employés » — faux.** Six points d'appel les passaient
   déjà explicitement (`color: 'stroke-chart-1'`, `'fill-chart-2'`) dans les trois pages
   `/app/overview/{agency,agent,owner}`. C'est le **défaut** de `BarChart`/`LineChart` — la
   couleur choisie quand l'appelant n'en passe pas — qui restait sur la palette brute. Le seul
   écran réellement atteint est donc celui du ticket : `AgencyRevenueSnapshot`, série unique et
   sans `color`, donc `fill-emerald-500` à 2,54:1.

2. **« Suivre la charte règle le contraste par la même occasion » — faux d'un jeton sur cinq.**
   `--chart-3` (`#c89a4a`) rend **2,57:1** sur `--card` clair, *moins bien* que l'`emerald-500`
   qu'il devait remplacer — et 8,17:1 en sombre. Le défaut n'existe que dans un thème, ce qu'une
   vérification faite dans un seul aurait conclu à l'envers. Le jeton est **écarté de l'ordre des
   séries** (`1, 2, 4, 5`), pas corrigé : changer sa valeur est une décision de charte →
   **TCK-404**.

3. **« 9 `'fr-FR'` sur la surface `/admin` » — introuvable sous cette forme.** La surface admin
   d'agence (`src/app/(dashboard)/admin` + `src/components/dashboard/admin`) en portait **0** ; les
   12 `'fr'`, eux, y étaient exactement. Les 63 `'fr-FR'` du dépôt sont ailleurs, et les 18 de la
   console super-admin relèvent de TCK-364. Périmètre retenu : surface admin d'agence + `charts`.

4. **`BarChart.tsx:128` — c'est la ligne 127** (`const palette`), 128 étant le `return`. Sans
   conséquence, noté pour que le prochain relevé ne se croie pas décalé.

**Deux décisions de forme, toutes deux payées par une mesure.**

- **Les classes de couleur sont des littéraux entiers**, jamais `` `fill-chart-${n}` `` : Tailwind
  v4 ne compile que les chaînes complètes trouvées en source. Une classe assemblée à l'exécution
  laisse le `<rect>` avec son `fill` par défaut — du noir — sans erreur ni avertissement, et
  invisible à `tsc` comme à ESLint.
- **`ChartSeries.color` n'est plus un `string`** mais l'union des jetons admis. C'est ce qui rend
  l'AC2 structurelle : aucune garde du dépôt ne couvre `src/components/charts`
  (`check-super-admin-tokens` s'arrête à la console super-admin, `check-app-tokens` ne connaît que
  le dialecte `--app-*`), donc une couleur brute écrite dans une page serait passée. `tsc` la
  refuse maintenant au point d'appel.

**`scripts/check-chart-contrast.mjs`** recalcule l'AC3 au lieu de la reporter une fois : elle lit
les jetons de série dans `charts/palette.ts` et les valeurs dans `globals.css`, **dans les deux
thèmes**, et échoue sous 3:1. Branchée dans `repo-ci.yml`. Vérifiée par ablation (3 mutations,
3 rouges).

**Vérification par ablation : 10 mutations, 10 rouges.** Deux d'entre elles sont passées vertes au
premier tour et ont fait ajouter deux cas — ce sont les deux qui comptent :

- mettre `bg-chart-1` sur **toutes** les pastilles de légende ne rougissait rien : les tests
  vérifiaient qu'une pastille porte *un* jeton, pas qu'elle porte *le même* que sa barre. Une
  légende qui donne une couleur à trois séries est pire qu'absente ;
- rétablir une locale figée dans `AgencyKpis` (dix des douze sites du ticket) ne rougissait rien
  non plus : aucun test n'y rendait autre chose que `fr`.

**Constat ouvert en ticket, pas corrigé :** `BarChart` ancre `min = 0` et rend une valeur négative
à `height="0"` — invisible, sans erreur, là où `LineChart` ouvre son domaine. Hors delta →
**TCK-405**, avec les deux sondes qui le documentent déjà dans
`charts/__tests__/palette-et-locale.test.tsx`.
