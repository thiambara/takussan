---
id: TCK-1022
title: "Retirer les `include=` non émis de quatre modèles, et faire voir à la garde les ressources rangées en sous-dossier"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features: []
  models:
    - "docs/models-spec.md#43-plan-"
    - "docs/models-spec.md#45-platformpayout-"
    - "docs/models-spec.md#52-agencyrole--tck-279"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-60--include-acceptés-chargés-et-non-émis--show-qui-ignorent-include-et-fields"
tags: [api, query-builder, include, garde, pistes]
---

## Contexte

Réf : **P60.01** du fichier de pistes, `retenu · autonome` (A3, A5). `PlatformPayout`, `Plan`,
`AgencyRole` et `BankStatement` acceptaient des `include=` que leur ressource n'émet pas : la
relation était chargée, puis absente de la réponse. La garde de TCK-807
(`RequestLoadableEmittedTest`) ne cherchait la ressource qu'à la racine de `app/Http/Resources`, et
sautait celles rangées sous `Api/Admin/`, `Agency/`, `Accounting/`. Aucun appelant du front n'envoie
ces `include=` (relu : `agency-roles.ts:71` n'inclut que `capabilities`, les requêtes des plans et
des reversements de plateforme n'envoient que `fields` et `sort`). Re-mesuré le 2026-10-20 sur
`pre-dev` c3c65f7a7 : la garde élargie, avant correctif, nomme ces quatre modèles et
`AgencySubscription` (P60.04, traité à part).

## Objectif

Un `include=` accepté par une liste est émis par sa ressource, où que la ressource soit rangée.

## Delta à produire

- [x] `RequestLoadableEmittedTest` : la ressource se cherche par son nom dans tout
      `app/Http/Resources` ; la ressource racine l'emporte (`AgencyResource` a une variante sous
      `Api/Admin/`) ; un nom porté par plusieurs fichiers hors racine fait échouer la garde.
      Plancher : `AgencyRole` et `BankStatement` (ressources en sous-dossier) sont balayés.
- [x] `$requestLoadable` retiré de `PlatformPayout` et de `Plan` ; `agency` retiré de
      `AgencyRole` et de `BankStatement`.
- [x] `AgencySubscription` : exemption temporaire, levée par P60.04 dans le même lot.

## Critères d'acceptation

- [x] AC1 — La garde rougit si l'un des quatre modèles accepte de nouveau la relation retirée.
- [x] AC2 — La garde rougit si la recherche de la ressource revient au seul chemin racine.

## Hypothèses (mode sans humain)

- Un `include=` retiré est refusé en 400 par spatie, comme ceux de TCK-807 : aucun appelant ne
  l'envoie, donc aucun appelant ne le voit.
- `BankStatementController::show` lit `include=` à la main avec sa propre liste blanche, qui
  garde `agency` : c'est P60.02, hors de ce ticket.

## Hors périmètre

- Les `load()` en dur des `show` (P60.02), les `fields` des `show` (P60.03).

## Notes d'implémentation

- Ablation 1 : modèles remis à `pre-dev`, garde élargie → rouge, les quatre modèles nommés.
- Ablation 2 : recherche remise au seul chemin racine → avant le plancher, 2 verts (la garde ne
  les voyait plus) ; avec le plancher, rouge « Failed asserting that an array has the key
  'AgencyRole' ». Remis → 2 verts.
