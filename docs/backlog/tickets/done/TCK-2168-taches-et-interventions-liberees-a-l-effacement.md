---
id: TCK-2168
title: "À l'effacement d'un compte, ses tâches ouvertes et ses interventions non closes sont libérées"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-2164]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-204--travail-dun-agent-laissé-à-son-compte-effacé"
tags: [back, account, tasks, maintenance, pistes]
---

## Objectif utilisateur

Après l'effacement d'un agent ou d'un prestataire, ses tâches et ses interventions encore ouvertes
apparaissent réellement « non assignées » à l'agence, au lieu de rester au nom d'un compte qui ne
les fera jamais.

## Contexte

Réf : **P204.03** du fichier de pistes, `validé` ; c'est aussi « ce qui reste est libéré » de la
décision de P204.01 (TCK-2164). Mesuré : après l'effacement, `tasks.assigned_to_id` et
`maintenance_requests.assigned_to` gardaient le compte, l'intervention restait `assigned`.

## Décision du porteur

> validation du porteur (2026-10-24) : à l'effacement, les tâches sont remises à `null`, et les interventions passent par `assign(keepQuote: true)` pour un agent et par `unassignProviderFromAgency` pour un prestataire

## Hypothèses (mode sans humain)

- Tâches : celles de `Task::OPEN_STATUSES` (`open`, `in_progress`) ; une tâche faite garde son assigné.
- Interventions : celles hors de `AgentPortfolio::CLOSED_MAINTENANCE` ; une intervention
  `completed` garde son assigné (le travail est rendu, et `assign()` refuse de la réassigner).
- « Agent » : le compte porte un profil d'agent ou d'admin non terminé dans l'agence du bien ;
  sinon il est traité en prestataire de cette agence.
- Appelé après la suppression du compte (aucun avis de désassignation ne lui part) et avant la fin
  de ses profils (qui dit s'il était du personnel).

## Reste à faire

> les interventions d'un bien sans agence encore assignées au compte effacé restent à son nom : `unassignProviderFromAgency` exige une agence

## Delta à produire

- [x] `ErasedMemberPortfolio::release()`, appelé par `AccountDeletionService::anonymize()`.
- [x] Test : `EffacementTachesEtInterventionsTest` (4 cas).

## Critères d'acceptation

- [x] AC1 — Tâches `open` et `in_progress` sans assigné après l'effacement ; tâche `done` inchangée.
- [x] AC2 — Intervention d'un agent en `quote_submitted` : sans assigné, acceptation remise à nul, statut et devis gardés.
- [x] AC3 — Intervention `in_progress` d'un prestataire : sans assigné, revenue en `open`.
- [x] AC4 — Intervention `completed` : assigné gardé.

## Hors périmètre

- Les interventions d'un bien sans agence (reste ci-dessus).

## Notes d'implémentation

- Ablation : l'appel à `release()` retiré → AC1 à AC3 rouges, AC4 vert (il garde l'absence) ; remis → vert.
