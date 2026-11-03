---
id: TCK-405
title: "`BarChart` rend une valeur négative à hauteur zéro — la barre disparaît sans bruit"
status: done
phase: P2
family: front
estimate: S
wave: 48
created: 2026-08-27
updated: 2026-08-28
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

- [x] AC1 — `values: [-500, 1000]` rend **deux** barres de hauteur > 0
- [x] AC2 — aucun `y` ni `y + height` hors du cadre utile (`PADDING.top` … `VIEW_H − PADDING.bottom`),
      assertion portant sur les **coordonnées**, jamais sur la présence du nœud
- [x] AC3 — une série entièrement positive rend exactement les mêmes coordonnées qu'avant
      (non-régression, vérifiée par comparaison et non par relecture)
- [ ] AC4 — vérification par ablation : rétablir `const min = 0` fait rougir AC1 **et** AC2
  > ⚠ non vérifié : le critère est FAUX tel qu'écrit, et la mesure le confirme. Ablation rejouée
  > hors de l'arbre (géométrie d'origine reprise de `git show c46c32dc^:…/BarChart.tsx`, aucun
  > fichier de code touché), sur `values: [-500, 1000]` : `min = 0` SEUL rend
  > `[{y:232,h:108},{y:16,h:216}]` → **AC1 VERTE**, AC2 rouge. Seul le code d'origine ENTIER
  > (`min = 0` + `Math.max(0, h)` + `y = top + innerH - h`) rend `[{y:340,h:0},…]` → AC1 **et**
  > AC2 rouges. L'ablation retenue par l'implémentation est donc la bonne, mais ce n'est pas
  > celle que l'AC décrit : la case ne peut pas être cochée sans réécrire le critère.

## Hors périmètre

- `LineChart`, déjà correct sur ce point.
- Enrichir le graphique (infobulles, comparaison de période) — TCK-375.

## Notes d'implémentation

**Le correctif tient en deux changements COUPLÉS, et c'est le point que l'AC4 rate.**

    const min = Math.min(...allValues, 0);        // le domaine s'ouvre vers le bas
    const h = (Math.abs(v) / range) * innerH;     // la longueur ne dépend que de |v|
    const y = v >= 0 ? yZero - h : yZero;         // …et le sens, du signe

**⚠ L'AC4 telle qu'écrite est FAUSSE, mesuré.** Elle demande que « rétablir `const min = 0` fasse
rougir AC1 **et** AC2 ». Rejoué :

| ablation | AC1 (deux barres > 0) | AC2 (coordonnées dans le cadre) |
|---|---|---|
| `const min = 0` SEUL | **verte** — les barres se tracent, dans le vide | rouge |
| le code d'origine ENTIER (`min = 0` + `Math.max(0, h)` + l'ancien `y`) | rouge | rouge |

Avec la nouvelle géométrie, remettre `min = 0` ne réintroduit pas l'avalement : la barre négative
descend sous une ligne de base restée au bas du cadre, donc hors cadre — AC2 le voit, AC1 non.
C'est le code d'ORIGINE ENTIER qui fait rougir les deux, et c'est cette ablation-là qui a été
retenue. *Une ablation qui ne rétablit qu'une moitié du défaut n'éprouve qu'une moitié du
correctif.*

**Deux écarts de FLOTTANT, tous deux trouvés par la comparaison de l'AC3 et non par relecture.**

1. La première version calculait la hauteur comme `|y(v) − y(0)|` avec une fonction `y(valeur)`
   factorisée. Algébriquement identique pour une série positive ; en flottant, elle rendait
   `height="57.599999999999994"` là où le code d'avant rendait `"57.6"`. La forme retenue calcule
   la longueur depuis `|v|` — pour `v >= 0`, `Math.abs(v)` et `v - 0` sont le MÊME flottant — ce
   qui rend le cas positif identique BIT À BIT. **L'AC3 est donc tenue au sens strict**, sur les
   quatre chemins (série ordinaire, deux séries, série plate, étendue fractionnaire), axe compris.
2. L'AC2 ne peut PAS s'écrire à l'exact : la barre `-500` du domaine −500…1000 rend
   `y + hauteur = 232.00000000000003`, parce qu'un tiers n'est pas représentable en binaire. Le
   test borne à 10⁻⁹ px — onze ordres de grandeur sous le pixel — et le dit dans son commentaire.
   L'écrire à l'exact ferait rougir un correctif juste sur une propriété de l'arithmétique.

**La ligne de base est un nœud à part, pas une graduation.** Zéro n'est aucune des trois
graduations dès que la série mélange les signes (domaine −500…1000 : graduations à −500, 250,
1000). Sans elle, les barres négatives pendraient depuis une ligne que rien ne dessine. Trait
PLEIN là où la grille est pointillée, `data-testid="bar-zero-line"`, rendu seulement si `min < 0`.

**Les deux sondes de TCK-374 sont devenues des assertions du comportement corrigé**, pas
supprimées : elles affirmaient `expect(hauteurs[0]).toBe(0)`, c'est-à-dire le défaut. *Une sonde
qui survit à son correctif est un test qui défend le défaut.*
