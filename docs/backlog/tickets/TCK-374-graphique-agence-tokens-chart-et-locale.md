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

_(à remplir par implementing-specs)_
