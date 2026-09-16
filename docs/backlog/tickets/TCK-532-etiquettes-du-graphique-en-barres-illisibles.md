---
id: TCK-532
title: "Les étiquettes de `BarChart` sont rendues sous 9 px : elles vivent dans un SVG mis à l'échelle"
status: todo
phase: P2
family: front
estimate: S
wave: 65
created: 2026-09-16
updated: 2026-09-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
  models: []
tags: [front, charts, lisibilité, responsive]
---

## Objectif utilisateur

Pouvoir lire les graduations et les libellés des graphiques en barres du tableau de bord sur
téléphone comme au bureau.

## Contrat de données

Relevé le 2026-09-16 pendant la revue design (groupe A) sur `/admin` : la revue a déjà calculé la
marge gauche (les graduations ne sortent plus du cadre) et porté les étiquettes à 12 unités de
`viewBox`. Mais `takussan-web/src/components/charts/BarChart.tsx` rend un SVG à `viewBox` fixe
mis à l'échelle de son conteneur : échelle **0,48 à 390 px** et **0,74 à 1366 px**, soit des
étiquettes de **5,7 px** et **8,8 px** à l'écran — sous le plancher de 12 px de la charte
(`docs/design-guidelines.md`).

Agrandir la taille en unités de `viewBox` ne corrige pas : la valeur reste proportionnelle à
l'échelle, qui varie avec la largeur.

## Contraintes strictes (métier)

1. Les étiquettes restent traduites et formatées par la locale active (`check-locale-figee`).
2. L'AC3 de TCK-405 et les tests existants des graphiques gardent leur intention : ils lisent
   aujourd'hui les `<text>` du SVG — les adapter, pas les supprimer.

## Delta à produire

- [ ] Sortir les étiquettes d'axe (et les valeurs, s'il y en a) du SVG mis à l'échelle — HTML
      superposé en positions relatives, ou SVG dimensionné en pixels réels mesurés — pour qu'elles
      soient rendues à une taille CSS fixe (`text-xs`, `tabular-nums`).
- [ ] Même examen pour `LineChart.tsx`, qui partage la construction.

## Critères d'acceptation

- [ ] AC1 — À 360, 390, 768 et 1366 px, la taille calculée des étiquettes de `BarChart` sur
      `/admin` est **≥ 12 px** (mesurée au navigateur, pas déduite).
- [ ] AC2 — Aucune étiquette ne sort du cadre du graphique à ces largeurs.
- [ ] AC3 — Les tests des graphiques restent verts et rougissent si l'étiquette redevient une
      taille en unités de `viewBox` (ablation notée).

## Hors périmètre

- Changer de bibliothèque de graphiques.

## Notes d'implémentation

_(à remplir par implementing-specs)_
