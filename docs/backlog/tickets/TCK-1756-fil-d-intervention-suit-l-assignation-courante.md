---
id: TCK-1756
title: "Le fil d'une intervention suit le prestataire assigné, pas la relation `assignee` restée en mémoire"
status: done
phase: P1
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-154--relations-restées-en-mémoire-après-une-écriture-faite-à-côté-delles"
tags: [api, maintenance, messagerie, pistes]
---

## Contexte

Réf : **P154.01** du fichier de pistes, `retenu · autonome`.

`SyncMaintenanceConversation` lisait l'instance de l'événement par
`loadMissing(['property', 'assignee', 'requester'])`, qui ne recharge pas une relation déjà
chargée. Sur une instance qui avait chargé `assignee` avant que `assign()`, `decline()` ou
`unassignProviderFromAgency()` change `assigned_to`, le fil gardait l'ancien prestataire, n'y
ajoutait pas le nouveau, remettait celui qui refuse, et le message système nommait l'ancien.

## Objectif

Le fil et son message suivent `assigned_to` tel qu'écrit.

## Delta à produire

- [x] L'écouteur relit `assignee` (`load('assignee')`) : la seconde voie de la Piste, un seul
  point au lieu des trois méthodes du service.
- [x] Tests dans `MaintenanceConversationTest` : réassignation et refus sur une instance qui a
  chargé `assignee`.

## Critères d'acceptation

- [x] AC1 — Réassigner A → B sur une instance chargée : le fil porte B (et non A), le message
  `assigned` nomme B.
- [x] AC2 — Le refus de A sur une instance chargée sort A du fil.

## Notes d'implémentation

- Une requête de plus par événement de maintenance, au profit d'une relation toujours juste.
- Avant correctif : 2 rouges (A reste et B manque ; A remis après son refus).
- Ablation : écouteur remis à `HEAD` → 2 rouges ; remis → 6/6.
