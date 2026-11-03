---
id: TCK-1878
title: "Une garde compare chaque groupe de libellés bâtis sur une valeur à la source de ses valeurs"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: [TCK-1876]
blocks: []
spec_refs:
  features:
    - "docs/features.md#28-internationalisation--préférences"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-192--libellés-résolus-par-une-clé-bâtie-sur-une-valeur"
tags: [back, i18n, tests, pistes]
---

## Objectif utilisateur

Un cas ajouté à un enum sans son libellé dans `fr`, `en` et `wo` fait rougir un test, au lieu
d'afficher `null`, le code ou la clé brute à l'utilisateur.

## Contexte

Réf : **P192.03** du fichier de pistes, `retenu · autonome` (A5 : test ajouté, sans seuil).

`LangGroupParityTest` compare les langues entre elles, jamais un groupe à l'enum qu'il traduit :
c'est ainsi que `properties.status.pending_review` et `rejected` ont manqué (P192.02, TCK-1876).

## Hypothèses (mode sans humain)

- Une table écrite à la main en tête du test, comme le demande la `Piste`, plutôt qu'une découverte
  automatique.
- La table reprend les clés bâties que l'explorateur a relevées et dont la source est unique :
  six enums de `PropertyResource`, deux de la conciliation, `MaintenanceStatus`,
  `NotificationType`, les deux listes statiques de `ThresholdAlert`, et la règle `in:` de
  `SubmitQuoteRequest` (lue dans la source du fichier, le test restant unitaire pur).
- Les replis silencieux ne changent pas : la `Piste` ne demande que la garde.

## Delta à produire

- [x] `tests/Unit/Lang/LabelKeysCoverValuesTest.php`.

## Critères d'acceptation

- [x] AC1 — Vert sur l'arbre, avec TCK-1876.
- [x] AC2 — Rouge si une valeur d'une source perd sa clé dans une langue, et le message nomme la langue et la clé.
- [x] AC3 — Rouge si une source ne rend plus aucune valeur (règle `in:` illisible par exemple).

## Reste à faire

- `calendar.feed.summary` n'est pas dans la table : ses clés se bâtissent sur `type` et `kind`,
  des littéraux de `CalendarEventCollector` sans source unique à lire.

## Hors périmètre

- Les clés next-intl du front bâties sur une valeur de l'API (angle 219).
- Unifier les replis (`null`, code, clé brute).

## Notes d'implémentation

- Ablation : les deux clés de TCK-1876 retirées des trois langues → rouge, six manques nommés
  (`fr : properties.status.pending_review absente`…) ; remises → vert.
