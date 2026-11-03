---
id: TCK-2008
title: "Le commentaire d'admin-users.ts dit que /api/users ne rend pas `roles`"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-176--rôles-lus-toutes-agences-confondues-par-profiletypes"
tags: [web, equipe, documentation, pistes]
---

## Objectif utilisateur

Qui reprend la colonne « Rôle » de `/app/agency/team` lit, dans le code, que la ligne ne porte pas
`roles`, et ne bâtit pas sur une donnée absente.

## Contexte

Réf : **P176.06** du fichier de pistes.

Décision du porteur : validé — validation du porteur (2026-10-23) : le découpage du délégué : le commentaire d'`admin-users.ts:26-29` tout de suite ; colonne « Rôle » et éditeur dérivés des `*_profiles` après constat à l'écran ; la révélation du numéro de pièce suit P176.02

Mesure reprise du mesureur (2026-10-23) : `GET /api/users` avec les `fields[users]` et l'`include`
de `fetchAdminUsers` rend `id, first_name, last_name, email, phone, status, last_login_at,
created_at, two_factor_enabled, agent_profiles, owner_profiles, agency_admin_profiles`, sans
`roles` ; relu sur `5fcadf598`, `UserAdminController::index` sérialise les modèles quand
`fields[users]` est posé, jamais `UserResource`.

## Hypothèses (mode sans humain)

- La révélation du numéro de pièce (`customers/[id]/page.tsx`, `isAdmin(roles)` de `/api/auth/me`)
  « suit P176.02 » : TCK-2002 borne `roles` aux profils actifs de l'agence active, et la page lit
  désormais ce `roles` juste, sans code de plus.

## Delta à produire

- [x] `takussan-web/src/lib/queries/admin-users.ts` : le commentaire dit ce que rend `/api/users`.

## Critères d'acceptation

- [x] AC1 — le commentaire ne prétend plus que `roles` est dérivé par `UserResource::toArray()`.

## Reste à faire

- Colonne « Rôle » d'`AdminUsersTable` et rôle de départ d'`UserRolesEditor` dérivés des
  `*_profiles`, après constat à l'écran : aucun écran n'a été rendu par l'implémenteur.

## Hors périmètre

- Tout changement de comportement de l'écran.

## Notes d'implémentation

- Pas d'ablation : le delta est un commentaire, sans test qui le garde.
