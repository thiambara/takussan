---
id: TCK-1255
title: "Passation : l'éligibilité d'une intervention se juge par la règle de TCK-592, et l'en-tête du service ne parle plus d'une règle « avant sa fusion »"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-121--passation-de-portefeuille--chaque-catégorie-face-au-geste-unitaire"
tags: [api, agence, passation, maintenance, pistes]
---

## Contexte

Réf : **P121.05** du fichier de pistes, `retenu · autonome` (A6).

`AgentHandoverService::eligibleForMaintenance()` juge `isStaffAt()` seul, et son docblock comme
l'en-tête du service parlent de la règle de TCK-592 « avant sa fusion ». Cette règle existe :
`ProviderEligibility::isAssignable()` (prestataire actif de l'agence, ou personnel de l'agence).
La requête de passation n'admet que le personnel (`StoreAgentHandoverRequest`,
`PersonnelDeLAgence::estPersonnel()`), si bien que la branche « désassignée » n'est atteinte que
par un appel direct du service.

## Objectif

Le service juge l'éligibilité d'une intervention par la règle de TCK-592, et ses commentaires
disent ce qu'il fait.

## Delta à produire

- [x] `eligibleForMaintenance()` : `ProviderEligibility::isActiveProviderAt() || isStaffAt()` pour
      l'agence de la passation, la forme de `isAssignable()` quand le bien est de cette agence.
- [x] En-tête du service et docblock de la méthode corrigés.

## Critères d'acceptation

- [x] AC1 — Appel direct du service : un prestataire actif de l'agence reçoit l'intervention
      (`moved.maintenance`) ; un compte ni personnel ni prestataire la laisse désassignée
      (`unassigned.maintenance`, `assigned_to` nul).
- [x] AC2 — Par HTTP, rien ne change pour un repreneur du personnel (`AgentHandoverTest`).

## Hypothèses

- La Piste offrait aussi de retirer la branche. Le classement (A6) retient l'appel à la règle de
  TCK-592 : c'est l'option retenue, la plus proche de l'intention de l'en-tête.
- `isAssignable()` prend un bien ; le portefeuille `maintenance` ne retient que les interventions
  des biens de l'agence (`AgentPortfolio::query()`), d'où son prédicat jugé une fois pour l'agence
  plutôt qu'une lecture du bien par intervention.
- L'intervention reste réécrite en masse, hors de `MaintenanceRequestService::assign()` : c'est
  P121.01, `à valider` (V1).

## Notes d'implémentation

- Ablation : `isActiveProviderAt()` retiré du prédicat → le test neuf rougit (`moved.maintenance`
  vide) ; remis → vert.
