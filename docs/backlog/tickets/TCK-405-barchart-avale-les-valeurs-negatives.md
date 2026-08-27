---
id: TCK-405
title: "`BarChart` rend une valeur négative à hauteur zéro — la barre disparaît sans bruit"
status: todo
phase: P2
family: front
estimate: S
wave: 48
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
tags: [front, charts, dette-silencieuse]
---

## Objectif utilisateur

Une série qui contient une valeur négative se voit — ou refuse de se dessiner. Elle ne disparaît
pas en silence.

## Contexte

Mesuré le 2026-08-27 pendant TCK-374, sur `takussan-web/src/components/charts/BarChart.tsx` :

```tsx
const min = 0;                                   // ← figé
const h = ((v - min) / range) * innerH;           // négatif si v < 0
<rect height={Math.max(0, h)} ... />              // ← ramené à 0
```

Rendu de `values: [-500, 1000]` : la première barre sort avec `height="0"`. **Aucune erreur, aucun
avertissement, aucun test rouge** — et un `y` calculé sous la ligne de base, donc une barre qui
serait hors du cadre utile si sa hauteur n'était pas ramenée à zéro.

`LineChart`, dans le même répertoire et pour la même donnée, fait `Math.min(...allValues, 0)` :
il ouvre son domaine et trace dans le cadre. **Deux composants jumeaux, deux comportements** — et
c'est le plus silencieux des deux qui sert le tableau de bord agence.

⚠ **Ancrer une échelle de barres à zéro est CORRECT** : une barre qui ne part pas de zéro ment sur
les rapports de longueur. Le défaut n'est pas l'ancrage, c'est qu'une valeur hors du domaine soit
avalée au lieu d'être dessinée sous la ligne de base. La correction n'est donc pas « copier
`LineChart` », c'est étendre le domaine vers le bas **en gardant zéro comme ligne de base**.

Les données servies aujourd'hui par `/api/dashboard/agency` (revenus, comptes) ne sont pas
négatives : ce ticket est une dette dormante, pas un bug visible. Il est ouvert parce qu'un
composant partagé (trois pages `/app/overview/*` plus le tableau de bord agence) qui perd une
donnée sans le dire coûtera son prix le jour où un solde ou une variation y entrera.

Deux tests de `charts/__tests__/palette-et-locale.test.tsx` documentent déjà le comportement
mesuré, sous `describe('sondes de domaine (constats, hors AC)')` — ils sont le point de départ.

## Contrat de données

Aucun.

## Direction UX / Artistique

Ligne de base à zéro visible dès qu'une valeur négative existe ; barres négatives dessinées vers
le bas depuis cette ligne.

## Contraintes strictes (métier)

- Zéro reste la ligne de base : le comportement d'une série entièrement positive ne change pas.
- L'axe des ordonnées gradue le domaine réellement tracé, bornes négatives comprises.

## Delta à produire

- [ ] Domaine de `BarChart` ouvert vers le bas quand la série le demande
- [ ] Ligne de base à zéro rendue quand `min < 0`
- [ ] Étiquettes de l'axe couvrant le domaine négatif
- [ ] Les deux sondes de TCK-374 converties en assertions du comportement corrigé

## Critères d'acceptation

- [ ] AC1 — `values: [-500, 1000]` rend **deux** barres de hauteur > 0
- [ ] AC2 — aucun `y` ni `y + height` hors du cadre utile (`PADDING.top` … `VIEW_H − PADDING.bottom`),
      assertion portant sur les **coordonnées**, jamais sur la présence du nœud
- [ ] AC3 — une série entièrement positive rend exactement les mêmes coordonnées qu'avant
      (non-régression, vérifiée par comparaison et non par relecture)
- [ ] AC4 — vérification par ablation : rétablir `const min = 0` fait rougir AC1 **et** AC2

## Hors périmètre

- `LineChart`, déjà correct sur ce point.
- Enrichir le graphique (infobulles, comparaison de période) — TCK-375.

## Notes d'implémentation

_(à remplir par implementing-specs)_
