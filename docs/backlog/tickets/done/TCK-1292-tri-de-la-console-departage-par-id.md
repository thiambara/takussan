---
id: TCK-1292
title: "Console : invitations de cooptation, export RGPD et sessions départagés par `id`"
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
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-118--listes-paginées-triées-sur-une-colonne-non-unique"
tags: [api, super-admin, tri, pistes]
---

## Contexte

Réf : **P118.06** du fichier de pistes, `retenu · autonome` (A1).

Trois lectures de la console trient sur une colonne non unique sans `id` : invitations de
cooptation (`SuperAdminInvitationController::index`, `created_at`), export des demandes de droits
(`PrivacyRequestController::export`, `due_at`) et sessions d'un utilisateur
(`UserDetailController::sessions`, `last_used_at, created_at`, **paginée**). L'ordre de deux lignes
égales suit le rangement physique de la table.

## Objectif

L'ordre de ces trois lectures est fixé, lignes égales comprises.

## Delta à produire

- [x] `id` en dernier tri, dans le sens du tri principal, aux trois lectures.
- [x] Test `TriDepartageParIdTest`.

## Critères d'acceptation

- [x] AC1 — Invitations de même seconde → rangées par `id` décroissant.
- [x] AC2 — Demandes de même échéance → exportées par `id` croissant.
- [x] AC3 — Sessions de même `last_used_at` et `created_at` → rangées par `id` décroissant.

## Hors périmètre

- Les autres listes de l'angle 118.

## Notes d'implémentation

- Le test rend l'écart observable : une ligne réécrite part en fin de table sous PostgreSQL, et
  un tri sans départage la rend à sa place physique.
- Ablation : trois contrôleurs remis à `HEAD` → 3 rouges ; correctif remis → 3/3 verts.
  `PrivacyRequestRegistryTest`, `PersonalDataAccessLogTest`, `SuperAdminInvitationLifecycleTest`,
  `UserDetailTest` verts.
