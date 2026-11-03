---
id: TCK-791
title: "GET /api/users sans fields[users] rend la projection par défaut, sans google_id ni metadata"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: [TCK-693]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#1-user"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-21--données-personnelles-dun-user-sorties-par-include"
tags: [back, rgpd, users, pistes]
---

## Contexte

Réf : **P21.02** du fichier de pistes, `validé` (critère accordé : V3, choix des données
personnelles d'un `User` qui sortent par défaut). `UserAdminController::index` rend
`$paginator->items()`, des modèles `User` bruts : sans `fields[users]`, toutes les colonnes non
cachées sortent (38 clés, `google_id`, `metadata`, second numéro). Le seul appelant du front
(`fetchAdminUsers`) passe `fields[users]` : l'exposition tient au contrat de l'API. TCK-693
(P21.01) a posé la projection d'un `User` inclus, `IncludedUserResource`.

## Décision du porteur

sans fields[users], la projection par défaut de P21.01 ; google_id et metadata jamais rendus

## Delta à produire

- [x] `UserAdminController::index` : sans `fields[users]`, chaque ligne passe par
      `IncludedUserResource`, plus `two_factor_enabled` (TCK-589) et les relations demandées par
      `include=`.
- [x] Test : `tests/Feature/Api/UserAdminDefaultProjectionTest.php`.

## Critères d'acceptation

- [x] AC1 — Sans `fields[users]`, une ligne porte exactement `id`, `first_name`, `last_name`,
      `full_name`, `email`, `phone`, `avatar_url` et `two_factor_enabled`.
- [x] AC2 — `include=agencyAdminProfiles` sans `fields[users]` rend toujours la relation, sans
      `google_id` ni `metadata`.
- [x] AC3 — Avec `fields[users]`, la ligne porte les colonnes demandées (et la 2FA) ;
      `fields[users]=…,google_id` ou `…,metadata` est refusé en 400 (`User::$queryFields`).

## Hors périmètre

- Les colonnes que `User::$queryFields` permet de demander (`status`, `bio`, `last_login_at`…) :
  la décision ne porte que sur la réponse par défaut et sur `google_id` / `metadata`.

## Hypothèses (mode sans humain)

- « Jamais rendus » avec `fields[users]` est déjà tenu par `User::$queryFields`, qui ne les liste
  pas : le test l'épingle, le code n'en change pas.

## Notes d'implémentation

- Ablation : contrôleur remis à `pre-dev` → AC1 et AC2 rouges (38 clés), AC3 vert (déjà tenu) ;
  remis → 3 verts. Les classes voisines (`UserAdminTest`, `UserAdminIncludeScopeTest`,
  `UserAdminAgencyScopeTest`, `UserSearchTest`, `RoleAccessTest`) restent vertes.
- Les médias des comptes de la page sont chargés d'un coup pour `avatar_url`, et la relation
  `media` est retirée des relations rendues.
