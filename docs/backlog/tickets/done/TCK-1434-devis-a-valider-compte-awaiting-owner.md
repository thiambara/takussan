---
id: TCK-1434
title: "« Devis à valider » du bailleur compte aussi les devis `awaiting_owner`"
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
    - "docs/features.md#18-maintenance--interventions"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-162--compteurs-et-sélecteurs--en-cours--écrits-par-une-liste-de-statuts-à-la-main"
tags: [api, maintenance, dashboard, pistes]
---

## Contexte

Réf : **P162.01** du fichier de pistes, `retenu · autonome` (A1). `quotes_pending` du tableau de
bord du bailleur ne compte que `quote_submitted`. Un devis au-delà du plafond passe
`awaiting_owner`, état dont seul le bailleur sort (ADR-0037) : c'est précisément le devis qu'il
doit trancher, et la carte « Devis à valider » ne le compte pas.

## Objectif

La carte compte tout devis qui attend une décision que le bailleur peut prendre.

## Delta à produire

- [x] `MaintenanceStateMachine::AWAITING_QUOTE_DECISION = [QuoteSubmitted, AwaitingOwner]`.
- [x] `DashboardOwnerService` (`quotes_pending`) et `MaintenanceRequestResource` (`can_decide_quote`) la lisent.

## Critères d'acceptation

- [x] AC1 — Sur un bien du bailleur, une intervention `quote_submitted` et une `awaiting_owner` → `quotes_pending = 2` ; `quote_requested` et `approved` ne comptent pas.
- [x] AC2 — Une `awaiting_owner` sur le bien d'un autre ne compte pas.
- [x] AC3 — `can_decide_quote` inchangé (`MaintenanceAbilitiesTest` vert).

## Hors périmètre

- Le libellé de la carte, inchangé.

## Notes d'implémentation

- Ablation : `DashboardOwnerService` remis à `bba57a9e0` → le test neuf rougit (1 au lieu de 2) ; remis → vert.
