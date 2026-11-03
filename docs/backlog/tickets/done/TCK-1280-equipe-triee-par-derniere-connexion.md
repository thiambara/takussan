---
id: TCK-1280
title: "Équipe d'agence : l'API accepte `sort=last_login_at`, que la colonne « Dernière connexion » écrit"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-150--sort-filter-et-include-du-front-face-aux-listes-blanches-de-lapi"
tags: [api, equipe, tri, query-builder, pistes]
---

## Contexte

Réf : **P150.01** du fichier de pistes, `retenu · autonome` (A1).

La colonne « Dernière connexion » de `/app/agency/team` porte `sortKey: 'last_login_at'` : un clic
sur l'en-tête écrit `?sort=-last_login_at`, que le relais transmet à `GET /api/users`. `User` ne
déclare pas ce tri : spatie rend 400, et la liste tombe en erreur (l'URL garde le tri, recharger
reproduit l'erreur). TCK-373 dit conserver ce tri (« mêmes tris », AC6).

## Objectif

`GET /api/users?sort=±last_login_at` rend 200, lignes rangées par dernière connexion.

## Delta à produire

- [x] `last_login_at` dans `User::$requestSortable`, que lisent les trois constructeurs de `User`.
- [x] Test `UserLastLoginSortTest` : administrateur d'agence (`buildAgencyTeamQuery`) et
      super-admin (`buildQuery`), tri montant et descendant.

## Critères d'acceptation

- [x] AC1 — Administrateur d'agence, `sort=last_login_at` et `sort=-last_login_at` avec
      `filter[role]=agent&filter[status]=active` → 200, membres rangés par dernière connexion.
- [x] AC2 — Super-admin, même tri sur `GET /api/users` → 200, rangé.

## Hors périmètre

- La garde de contrat front ↔ API (P150.04, à valider, V6).
- La place des comptes jamais connectés : PostgreSQL range `NULL` en tête d'un tri descendant ;
  rien ne l'écrit, le tri suit le moteur (hypothèse retenue : pas de `NULLS LAST` imposé).
- `GET /api/admin/users` tient sa propre liste (`UserDetailController`), qui accepte déjà ce tri.

## Notes d'implémentation

- La console super-admin passe par `/api/admin/users`, qui acceptait déjà `last_login_at` : le
  test du super-admin vise donc `GET /api/users`, la branche `buildQuery()`.
- Ablation : `User.php` remis à `HEAD` → 4 rouges (400) ; correctif remis → 4/4 verts.
  `PersonNameCollatedSortTest` (9) et `UserAdminTest` (7) verts.
