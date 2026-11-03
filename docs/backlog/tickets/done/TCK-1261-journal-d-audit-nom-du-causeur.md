---
id: TCK-1261
title: "Journal d'audit : le causeur se nomme par `full_name`, et non par une colonne `name` que `users` n'a pas"
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
    - "docs/features.md#26-audit--traçabilité"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-139--colonnes-des-exports-quaucun-chemin-nécrit-ou-qui-lisent-une-clé-nommée-autrement"
tags: [api, audit, pistes]
---

## Contexte

Réf : **P139.03** du fichier de pistes, `retenu · autonome` (A1).

`AuditLogController::index()` rend `causer.name = $log->causer->name ?? null`. La table `users`
n'a pas de colonne `name`, ni le modèle d'accesseur : la clé est toujours nulle, et l'écran du
journal (`AuditTrail.tsx`) montre l'adresse en titre au lieu du nom. Le fil d'activité du client
(`CustomerActivityFeed`) nomme déjà le causeur par `getFullNameAttribute()`.

## Objectif

`GET /api/activity-log` rend le nom du causeur sous `causer.name`.

## Delta à produire

- [x] `causer.name` ← `full_name` pour un causeur `User`, nul quand il est vide (l'écran retombe
      alors sur l'adresse) ; un autre type de causeur garde sa lecture de `name`.

## Critères d'acceptation

- [x] AC1 — Un causeur « Awa Ndiaye » est rendu `{id, name: "Awa Ndiaye", email}`.
- [x] AC2 — `ActivityLogEndpointTest`, `AgencyAuditScopeTest`, `CrossTenantAuditTest` verts.

## Hypothèses

- Le nom vide rend `null` plutôt que `""`, pour garder le repli de l'écran sur l'adresse.

## Notes d'implémentation

- Ablation : contrôleur remis à `$log->causer->name ?? null` → le test neuf rougit (`name: null`) ;
  remis → vert.
