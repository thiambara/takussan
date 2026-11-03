---
id: TCK-1136
title: "Les listes de membres, d'utilisateurs et de clients trient prénoms et noms en ordre ICU"
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
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#1-user"
    - "docs/models-spec.md#7-customer"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-87--tris-alphabétiques-sous-la-collation-c"
tags: [back, users, crm, collation, adr-0025, pistes]
---

## Contexte

Réf : **P87.01** du fichier de pistes, `retenu · autonome` (A1 : l'amendement du 2026-10-19
d'ADR-0025 écrit déjà qu'une liste triée sur un nom de personne affiché trie en `und-x-icu`, par une
classe sous `app/Sorts/`).

`sort=first_name` et `sort=last_name` passaient par `$requestSortable` de `User` et `Customer`,
donc par un `ORDER BY` nu ; la console super-admin (`/api/admin/users`) triait par un `orderBy()`
écrit à la main, sans départage. Sous `--locale=C`, « awa » et « Élodie » passaient après « Zeynab ».

## Objectif utilisateur

Les membres d'une agence, l'équipe, les comptes de la console et les clients sortent dans l'ordre
alphabétique attendu, quelle que soit la casse ou l'accent de l'initiale.

## Delta à produire

- [x] `User` : `first_name` et `last_name` quittent `$requestSortable` ; `User::nameSorts()` les
      rend par `CollatedNameSort` (`users.first_name`, `users.last_name`), et les trois listes
      blanches du modèle (`buildQuery()`, `buildAgencyTeamQuery()`, `buildAgencyMembersQuery()`)
      les ajoutent.
- [x] `Customer` : même retrait, et `buildQuery()` ajoute les deux tris en collation
      (`customers.first_name`, `customers.last_name`).
- [x] `Admin\UserDetailController::index()` : prénom et nom triés par `CollatedNameSort`, et
      `users.id` en départage de tout tri.
- [x] Test `tests/Feature/Api/PersonNameCollatedSortTest.php`.

## Critères d'acceptation

- [x] AC1 — quatre agents « Zeynab », « awa », « Élodie », « Binta » →
      `/api/agencies/{id}/members?sort=first_name`, `/api/users?sort=first_name` et
      `/api/admin/users?sort=first_name` rendent « awa | Binta | Élodie | Zeynab », et l'inverse
      sur `-first_name`.
- [x] AC2 — clients « Zola », « diop », « Écrivain », « Ba » → `/api/customers?sort=last_name,first_name`
      rend « Ba | diop | Écrivain | Zola », et l'inverse sur `-last_name,first_name`.
- [x] AC3 — trois homonymes sur `/api/admin/users?sort=first_name` sortent dans l'ordre de leur `id`.

## Hors périmètre

- L'équipe d'une agence vue du super-admin (`Admin\AgencyDetailController::team`), citée par la
  même piste : son tri par défaut est repris par TCK-1137 (P87.04), du même lot, qui le passe en
  `defaultSorts()` par `User::nameSorts()`.
- Aucun changement du front : il demande déjà ces tris.
- Une garde qui refuserait une colonne de nom dans `$requestSortable` (suggérée par la piste) :
  non écrite, la piste la présente comme possible.

## Notes d'implémentation

- Ablation : `User.php`, `Customer.php` et `UserDetailController.php` rendus à `HEAD` → 9 rouges
  sur 9 ; correctif remis → 9/9.
- Le départage par homonymes rougissait aussi avant correctif (ids 6, 8, 7) : l'ordre des égaux
  n'est pas garanti par PostgreSQL.
