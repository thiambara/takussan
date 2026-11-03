---
id: TCK-1137
title: "Équipe d'une agence vue du super-admin : filtre de statut sur les deux branches, tri demandé souverain"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: [TCK-1136]
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#1-user"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-87--tris-alphabétiques-sous-la-collation-c"
tags: [back, admin, users, collation, pistes]
---

## Contexte

Réf : **P87.04** du fichier de pistes, `retenu · autonome` (A1 : `status` est déclaré filtrable et
`email` triable sur `User`, et `AgencyController::listMembers` écrit déjà la forme groupée).

`Admin\AgencyDetailController::team` construisait sa base par
`whereHas('agentProfiles')->orWhereHas('ownerProfiles')` sans groupe, puis `orderBy('first_name')`
avant `User::buildQuery()`. Le `filter[status]` ne visait que la branche des propriétaires, et un
`sort=` demandé venait après le prénom.

## Objectif utilisateur

Le super-admin qui filtre l'équipe d'une agence sur un statut, ou la trie, obtient ce qu'il demande,
et l'ordre par défaut suit l'ordre alphabétique attendu.

## Delta à produire

- [x] `team()` : les deux `whereHas` groupés dans un `where(fn …)`.
- [x] Le tri par défaut passe de `orderBy()` à `defaultSorts(...User::nameSorts(), 'id')` (TCK-1136).
- [x] Test `tests/Feature/Api/Admin/AgencyTeamQueryTest.php`.

## Critères d'acceptation

- [x] AC1 — un agent `blocked` et un propriétaire `active` : `filter[status]=active` ne rend que le
      second, `filter[status]=blocked` que le premier ; un utilisateur hors de l'agence ne sort jamais.
- [x] AC2 — `sort=email` et `sort=-email` rangent par e-mail, sans le prénom devant.
- [x] AC3 — sans `sort=`, prénoms « Agent », « awa », « Élodie », « Proprio », « Zeynab » dans cet
      ordre (ICU).

## Hors périmètre

- Le front n'envoie aujourd'hui ni `filter` ni `sort` sur cette route : rien ne change à l'écran,
  hors l'ordre ICU par défaut.

## Notes d'implémentation

- Ablation : `AgencyDetailController.php` rendu à `HEAD` → 3 rouges sur 3 ; remis → 3/3.
- `id` en dernier départage du défaut : deux homonymes ne changent plus de page.
