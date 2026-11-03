---
id: TCK-1296
title: "Les listes paginées de buildQuery() se départagent par la clé primaire : plus de ligne rendue deux fois ni jamais"
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
    - "docs/features.md#24-recherche--filtres"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-118--listes-paginées-triées-sur-une-colonne-non-unique"
tags: [back, pagination, query-builder, pistes]
---

## Contexte

Réfs : **P118.02** (🔴) et **P118.03** (🟠) du fichier de pistes, `retenu · autonome` (A1), même
cause et même correctif. `buildQuery()` ne posait aucun départage : une liste triée sur une
colonne partagée (`created_at` en `timestamp(0)`, `period_end`, `issue_date`, `status`…), par
défaut ou par `sort=`, rendait d'une page à l'autre des lignes deux fois et d'autres jamais,
dès qu'une mise à jour avait déplacé l'ordre physique des lignes.

## Objectif utilisateur

Qui parcourt une liste page par page voit chaque ligne une fois.

## Contrat de données

Aucun paramètre neuf. Les lignes dont la clé de tri diffère gardent leur ordre ; seules les
lignes égales sont désormais rangées par `id`, dans le sens du dernier tri.

## Contraintes strictes (métier)

- Le départage vient **après** tout tri, par défaut ou demandé : il ne change jamais le tri demandé.
- Rien n'est ajouté à une requête sans tri, déjà triée sur sa clé, ou portant `GROUP BY`,
  `DISTINCT` ou `UNION`.

## Delta à produire

- [x] `App\Support\Query\DepartageQueryBuilder` (dérivé du `QueryBuilder` de spatie) : ajoute la
  clé primaire qualifiée juste avant `paginate()` / `simplePaginate()`.
- [x] `HasQueryBuilder::buildQuery()` et les `buildQuery()` propres à `User` (avec
  `buildAgencyTeamQuery` et `buildAgencyMembersQuery`), `Customer`, `MaintenanceRequest`,
  `AgencyRole`, `GeoNeighborhood` et `Tag` le construisent.
- [x] Test : `DepartageDesListesPagineesTest`.

## Critères d'acceptation

- [x] AC1 — 150 factures de même `created_at`, un tiers mises à jour : 10 pages de 15 de
  `GET /api/invoices` rendent 150 factures distinctes.
- [x] AC2 — Même jeu avec `sort=issue_date` : 150 distinctes, rangées par `id` croissant.
- [x] AC3 — 60 reversements de même `period_end` : `GET /api/admin/payouts` les rend chacun une
  fois, rangés par `id` décroissant (sens de `-period_end`).
- [x] AC4 — Sans tri, avec un tri sur `id`, ou sous `GROUP BY`, aucun tri n'est ajouté.

## Hors périmètre

- Les listes montées par `QueryBuilder::for()` directement dans un contrôleur
  (`AuditLogController`, `CrossTenantAuditController`, `MessagingContactController`,
  `RoleDelegationController`, `UserDetailController::activity`, et les deux publiques qui
  départagent déjà).
- Les listes écrites à la main hors `buildQuery()` (angle 135) ; la file de modération (P118.05).
- L'ordre par défaut des relevés (P118.04), qui n'ont aucun tri sans `sort=`.

## Notes d'implémentation

- Spatie applique ses tris dès `defaultSort()` / `allowedSorts()` : le départage ne peut donc pas
  se poser dans `buildQuery()` ; il se pose à l'appel de la pagination, par `__call`.
- Les reversements (AC3) ne perdaient pas de ligne à 60 sur ce jeu, mais leur ordre entre lignes
  égales n'était pas fixé : c'est l'assertion d'ordre qui rougit sans le correctif.
- Ablation : `buildQuery()` et les surcharges des modèles rendus à `HEAD` (classe gardée) → 4
  rouges (147/150 distinctes deux fois, ordre des reversements, type du builder) ; correctif remis
  → 4/4 verts.
