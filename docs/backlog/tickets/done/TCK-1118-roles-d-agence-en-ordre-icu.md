---
id: TCK-1118
title: "Les rôles d'une agence se rangent en ordre ICU : « gérant » et « Équipe terrain » avant « Zélateur »"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#22-rôles--permissions"
  models:
    - "docs/models-spec.md#52-agencyrole--tck-279"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-87--tris-alphabétiques-sous-la-collation-c"
tags: [back, agency, roles, collation, adr-0025, pistes]
---

## Contexte

Réf : **P87.02** du fichier de pistes, `validé (délégué)` (V7 accordé : l'ordre alphabétique d'une
liste déjà triée par nom, ramené à l'ordre qu'ADR-0025 amendé fixe pour les noms).

`GET /api/agencies/{agency}/roles` triait `name` par un `ORDER BY` nu, au défaut comme sur
`sort=name`. Sous `--locale=C`, l'ordre des octets rangeait un rôle saisi en minuscule ou
commençant par « É » après « Zélateur ».

## Décision du porteur (déléguée)

trier les rôles d'une agence en `COLLATE "und-x-icu"` par `CollatedNameSort` (`AllowedSort::custom('name', …, 'agency_roles.name')` dans `AgencyRole`, et le défaut `defaultSort('name')` de `RoleController::index()` par la même classe), départage par `id` ; test : « Zélateur », « gérant », « Comptable », « Équipe terrain » → « Comptable » et « Équipe terrain » et « gérant » avant « Zélateur », en tri montant et descendant

## Objectif utilisateur

L'administrateur d'agence retrouve ses rôles dans l'ordre alphabétique qu'il attend, quelle que soit
la casse ou l'accent de l'initiale.

## Delta à produire

- [x] `AgencyRole` : `name` quitte `$requestSortable` ; `AgencyRole::nameSort()` rend
      `AllowedSort::custom('name', new CollatedNameSort, 'agency_roles.name')`, et `buildQuery()`
      l'ajoute aux tris déclarés.
- [x] `RoleController::index()` : `defaultSorts(AgencyRole::nameSort(), 'id')` au lieu de
      `defaultSort('name')`.
- [x] Test `tests/Feature/Api/Agency/AgencyRoleCollatedSortTest.php`.

## Critères d'acceptation

- [x] AC1 — rôles « Zélateur », « gérant », « Comptable », « Équipe terrain » → « Comptable »,
      « Équipe terrain », « gérant », « Zélateur », au défaut et sur `sort=name`.
- [x] AC2 — l'ordre inverse sur `sort=-name`.

## Hors périmètre

- Les autres listes de l'angle 87 (membres, étiquettes, quartiers, agences), traitées par leurs
  propres entrées.
- Aucun changement du front : il demande déjà `sort=name`.

## Notes d'implémentation

- Ablation : le modèle et le contrôleur rendus à `HEAD` → 3 rouges sur 3 ; correctif remis → 3/3.
- Le départage par `id` ne sert qu'au défaut : la collation `und-x-icu` de PostgreSQL est
  déterministe (deux noms distincts ne sont jamais égaux) et `(agency_id, name)` est unique, donc
  deux rôles d'une agence ne sont jamais à égalité sur `sort=name`.
