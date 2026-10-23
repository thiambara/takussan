---
id: TCK-1843
title: "Une recherche par nom qui contient une virgule filtre les annuaires publics des agences et des agents au lieu d'être ignorée"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-187--paramètres-des-routes-publiques-sans-compte-face-à-une-valeur-mal-formée"
tags: [back, public, annuaires, recherche, pistes]
---

## Contexte

Réf : **P187.01** du fichier de pistes, `retenu · autonome` (A1). spatie découpe toute valeur de
filtre qui contient `,` en tableau ; les rappels `search` de `PublicAgencyController::index` et
`PublicAgentController::index` sortent sans filtrer sur un tableau. Chercher « Diop, Awa » rendait
tout l'annuaire. P151.01 (TCK-1401) a corrigé le même découpage pour `HasQueryBuilder` par
`->delimiter('')` ; ces deux annuaires construisent leur `QueryBuilder` à la main.

## Objectif utilisateur

Un visiteur qui cherche une agence ou un agent par un nom qui contient une virgule obtient les
profils qui portent ce nom, et non tout l'annuaire.

## Contrat de données

Aucun changement : `GET /api/public/agencies` et `GET /api/public/agents`, `filter[search]`.

## Contraintes strictes (métier)

- La virgule reste du texte dans `filter[search]`, comme sur les autres listes (TCK-1401).

## Delta à produire

- [x] `->delimiter('')` sur le filtre `search` des deux annuaires.
- [x] Test dans `PublicProfileIndexTest` : un nom avec virgule, sur chaque annuaire, à côté d'un
  second profil qui ne doit pas sortir.

## Critères d'acceptation

- [x] AC1 — Agences « Immo, Conseil » et « Sahel Homes », `filter[search]=Immo, Conseil` → la seule
  première.
- [x] AC2 — Agents « Awa Diop, Ndiaye » et « Moussa Fall », `filter[search]=Diop, Ndiaye` → le seul
  premier.

## Hors périmètre

- Le `%` et le `_` du motif `LIKE` restent des jokers dans ces deux recherches (même famille que
  P186.02, non relevée sur ces fichiers).

## Notes d'implémentation

- Reproduction : le test neuf, rouge avant correctif (les deux agences sortent).
- Ablation : `->delimiter('')` retiré de l'agence seule → rouge l. 648 ; retiré de l'agent seul →
  rouge l. 656 ; remis → vert, et 23/23 dans `PublicProfileIndexTest`.
