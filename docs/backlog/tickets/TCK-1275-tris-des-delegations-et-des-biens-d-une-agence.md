---
id: TCK-1275
title: "Délégations de rôle et biens d'une agence dans la console : un tri déclaré, et un ordre par défaut départagé"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-119--requêtes-de-base-passées-à-buildquery-et-querybuilderfor"
tags: [api, delegations, console, tri, pistes]
---

## Contexte

Réf : **P119.04** du fichier de pistes, `retenu · autonome` (A1).

`RoleDelegationController::index` monte `QueryBuilder::for()` sans `allowedSorts()` : un `sort=`
y est ignoré sans 400, et retire en plus le tri par défaut (`defaultSorts()` rend la main dès
qu'un `sort=` est présent) : la liste sort sans `ORDER BY`.
`Admin\AgencyDetailController::properties` ne pose ni tri par défaut ni départage.

## Objectif

Le contrat de tri des délégations est déclaré, et les biens d'une agence ont un ordre stable sans
`sort=`.

## Delta à produire

- [x] `allowedSorts('created_at')` sur `GET /api/agencies/{agency}/role-delegations`.
- [x] `defaultSorts('-created_at', '-id')` sur `GET /api/admin/agencies/{id}/properties`, la
      pertinence d'une recherche gardée en tête (`defaultSortsWithRelevance()`).
- [x] Tests : `sort=created_at` trie les délégations, un `sort=` inconnu rend 400 ; les biens
      d'une agence sortent du plus récent au plus ancien sans `sort=`, départagés par `id`.

## Critères d'acceptation

- [x] AC1 — `GET …/role-delegations?sort=created_at` rend les délégations de la plus ancienne à
      la plus récente ; `sort=user_id` → 400.
- [x] AC2 — `GET /api/admin/agencies/{id}/properties` sans `sort=` rend les biens par
      `created_at` décroissant puis `id` décroissant.

## Hors périmètre

- Le départage par `id` des autres listes de `buildQuery()` et un mécanisme commun : P118.02.

## Notes d'implémentation

- Test : `tests/Feature/Api/TrisDeclaresDeLAngle119Test.php`. Avant correctif : `sort=created_at`
  ignoré (ordre physique, la plus récente d'abord) et `sort=user_id` → 200 ; les biens sortent
  dans l'ordre d'insertion.
- Ablation : `allowedSorts()` et `defaultSorts()` retirés → les deux tests rouges ; remis → verts.
  `RoleDelegationTest`, `RoleDelegationCapabilityTest`, `AgencyDetailTest` verts.
- Le docblock de `takussan-web/src/lib/queries/role-delegations.ts` (« l'ordre est PERDU » sur un
  `sort=`) décrit désormais l'état d'avant : `sort=created_at`/`-created_at` est servi, un autre
  rend 400. Le front n'envoie toujours aucun `sort=` ; le docblock n'est pas touché ici (côté
  front, hors du lot).
