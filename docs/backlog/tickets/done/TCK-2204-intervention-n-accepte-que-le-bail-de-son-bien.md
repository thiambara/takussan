---
id: TCK-2204
title: "Une demande d'intervention n'accepte que le bail de son propre bien"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-226--identifiants-de-ligne-cible-reçus-du-client-sur-les-routes-décriture"
tags: [api, maintenance, bail, pistes]
---

## Objectif

`POST /api/maintenance-requests` refuse un `lease_id` dont le bien n'est pas le `property_id` de
la demande, avec la réponse d'un bail absent ou invisible (403, TCK-1070).

## Contexte

Réf : **P226.02** du fichier de pistes, `retenu · autonome` (A1).

Le bail rattaché n'était jugé que par `$user->can('view', $lease)` : un bailleur de deux biens, ou
un admin d'agence, créait une demande sur P1 rattachée au bail de P2 (201). La règle « un bail et un
bien rattachés ensemble vont ensemble » est écrite par TCK-576 pour les fils
(`GuardsConversationScope::guardLeaseMatchesProperty`), le refus par TCK-1070. Le front envoie
toujours le bail avec son propre bien (`MaintenanceNewLauncher.tsx:58-59`, relevé du mesureur).

## Hypothèses (mode sans humain)

- Le refus est le 403 du bail invisible, et non un 422 : la `Piste` le demande (« avec le refus
  d'un bail invisible »), et un 422 distinct dirait au client qu'un bail existe.
- Le `PATCH` ne connaît pas `lease_id` (`UpdateMaintenanceRequestRequest`) : rien à y faire.

## Reste à faire

- Relire en `SELECT` les demandes existantes dont `lease_id` vise un autre bien, avant de décider
  s'il faut les corriger (correction de données : V4).

## Delta à produire

- [x] `MaintenanceRequestController::store` : `lease.property_id === property.id` dans la garde du
      bail rattaché.
- [x] `BailDuMemeBienTest`.

## Critères d'acceptation

- [x] AC1 — bailleur de P1 et P2, `{property_id: P1, lease_id: <bail de P2>}` → 403, réponse
      identique à celle d'un bail absent, aucune ligne créée.
- [x] AC2 — témoin : `{property_id: P2, lease_id: <bail de P2>}` → 201.

## Notes d'implémentation

- Avant correctif : AC1 rouge (201).
- Ablation : la comparaison des biens retirée → AC1 rouge ; rétablie → 2 verts.
