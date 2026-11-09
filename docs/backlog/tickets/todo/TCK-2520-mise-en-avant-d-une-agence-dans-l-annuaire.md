---
id: TCK-2520
title: Mise en avant d'une agence dans l'annuaire, par ville et période, offerte par la plateforme
status: todo
phase: P1
family: full
estimate: M
wave: 85
created: 2026-11-09
updated: 2026-11-09
depends_on: []
blocks: [TCK-2521, TCK-2525]
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#124-agencyspotlight-"
tags: [back, front, super-admin, directory, audit-ux]
---

## Objectif utilisateur

Une agence peut occuper la vitrine de l'annuaire d'une ville ; le chercheur la voit signalée comme telle, sans que l'ordre de la liste en soit changé.

## Contrat de données

- Table `agency_spotlights` (cf. `spec_refs.models`) : agence, ville (`geo_city_id`, `null` = annuaire sans ville), période ; au plus une place active par ville et par instant — contrainte d'exclusion `EXCLUDE USING gist (geo_city_id WITH =, tstzrange(starts_at, ends_at) WITH &&)` (extension `btree_gist` ; une ville `null` se garde par un index d'exclusion partiel à part, `=` ne joignant pas deux `NULL`).
- Super-admin : `GET/POST/DELETE /api/admin/agency-spotlights` (capacité de plateforme sur la mise en avant, TCK-633 lot F), journalisé ; un chevauchement → 422 lisible.
- Public : `GET /api/public/agencies?filter[city]=…` émet `spotlight` (l'agence active pour cette ville, avec sa `cover` de TCK-2518) à côté de la liste, **sans retirer l'agence de son rang** (décision 1a du porteur, 2026-11-09). Une agence suspendue ou inactive n'est jamais émise.

## Direction UX / Artistique

- Console super-admin : une section « Mise en avant d'agences » dans la page des crédits et boosts — liste, ville, période, motif, bouton « Offrir » ; formes et champs de la console existants.
- Public : servie par TCK-2521.

## Contraintes strictes (métier)

- **Offerte seulement.** La vente de la place en crédits est TCK-2525, qui commence par un **amendement d'ADR-0061** (la mise en avant s'étend d'un bien à une agence).
- Une seule vitrine par ville : jamais deux « Mise en avant » en tête.
- Le classement de la liste ignore les places (aucun tri par place).

## Delta à produire

- [ ] Migration (avec `btree_gist`) + modèle `AgencySpotlight`.
- [ ] Routes super-admin + FormRequests + journal.
- [ ] `spotlight` dans l'annuaire public.
- [ ] Section de console super-admin.
- [ ] Tests (chevauchement refusé, agence suspendue jamais émise, rang inchangé).

## Critères d'acceptation

- [ ] AC1 — Deux places qui se chevauchent sur Dakar : la seconde est refusée (422), la base n'en garde qu'une.
- [ ] AC2 — L'agence mise en avant à Dakar apparaît dans `spotlight` ET à son rang dans `data`, au même rang que sans la place.
- [ ] AC3 — Suspendre l'agence la retire de `spotlight` à la requête suivante, sans écriture sur la place.

## Hors périmètre

- La vente en crédits : TCK-2525 (amendement d'ADR-0061 d'abord).
- La mise en avant d'un agent.

## Notes d'implémentation

_(à remplir par implementing-specs)_
