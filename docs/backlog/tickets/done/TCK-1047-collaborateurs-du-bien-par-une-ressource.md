---
id: TCK-1047
title: "`/api/properties/{id}/collaborators` rend chaque ligne par une ressource, le compte projeté"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  models:
    - "docs/models-spec.md#8-propertycollaborator"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-61--modèles-rendus-bruts-par-un-contrôleur-au-delà-de-user"
tags: [api, ressource, rgpd, collaborateurs, pistes]
---

## Contexte

Réf : **P61.01** du fichier de pistes, `validé` par le porteur (V3). `index` et
`designatePrimary` rendaient `$property->collaborators()->with('user')->get()` sans ressource,
`store` et `update` le modèle chargé de même : seul `User::$hidden` filtrait le compte inclus, soit
38 clés (`google_id`, `metadata`, `secondary_phone`, `last_login_at`…), au bailleur du bien comme à
tout membre de l'agence. Re-mesuré le 2026-10-20 sur `pre-dev` 96392a9cb par les tests ci-dessous,
rouges avant le correctif (`data.0.user` à 38 clés).

## Décision du porteur

> validé — ressource pour `index`, `store`, `update` et `designatePrimary`, compte projeté par `IncludedUserResource` plus `username` (slug public) ; test : bailleur et agent, `data.0.user` n'a que les clés de la projection (porteur, 2026-10-20)

## Objectif

Le compte d'un collaborateur ne sort plus que par la projection d'`IncludedUserResource`, plus
`username`, sur les quatre routes.

## Delta à produire

- [x] `App\Http\Resources\PropertyCollaboratorResource` : la ligne (`id`, `property_id`,
      `user_id`, `role`, `is_primary`, `commission_share`, les dates), et `user` par
      `IncludedUserResource` plus `username`.
- [x] `PropertyCollaboratorController` : `index`, `designatePrimary` (par `collaboratorsPayload`),
      `store` et `update` passent par elle ; les médias des comptes sont préchargés
      (`IncludedUserResource::preload`) pour `avatar_url`.
- [x] Tests dans `tests/Feature/Api/PropertyCollaboratorTest.php`.

## Critères d'acceptation

- [x] AC1 — Le bailleur du bien lit la liste : `data.0.user` n'a que `id`, `first_name`,
      `last_name`, `email`, `phone`, `full_name`, `avatar_url`, `username`.
- [x] AC2 — Un agent de l'agence lit la liste : même projection, `role` et `is_primary` inchangés.
- [x] AC3 — `store` et `update` rendent `data.user` sous la même projection, `commission_share`
      toujours en chaîne (`"10.00"`).

## Hypothèses (mode sans humain)

- `commission_share` garde la chaîne du cast `decimal:2` : le type du front
  (`property-collaborators.ts`) la lit ainsi, et la décision ne porte que sur le compte.
- `metadata` de la ligne de collaboration n'est plus rendue : aucune écriture dans `app/`, aucune
  lecture dans le front (mesuré par `grep`). Les dates sortent par `iso()` (ADR-0018) ; le front
  n'en lit aucune.

## Hors périmètre

- Le reste de l'angle 61 hors du lot (P61.04, la garde de `Base\Controller::json()`).

## Notes d'implémentation

- Ablation : les trois sorties remises brutes (`$lignes`, `$collaborator->load('user')`) → 3 rouges
  sur 22 ; remises → 22 verts.
