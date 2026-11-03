---
id: TCK-1329
title: "Passation : une intervention passe au repreneur par le chemin d'assignation (fil, notification, acceptation), devis du partant gardé"
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
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-121--passation-de-portefeuille--chaque-catégorie-face-au-geste-unitaire"
tags: [api, agence, passation, maintenance, pistes]
---

## Contexte

Réf : **P121.01** du fichier de pistes, `validé`.

La catégorie `maintenance` de `AgentHandoverService` écrivait `assigned_to` par un `update()` en
masse. Le geste unitaire passe par `MaintenanceRequestService::assign()`, qui remet `accepted_at`
à nul et émet `MaintenanceStatusChanged` : c'est cet événement qui fait sortir l'ancien assigné
du fil de l'intervention, y fait entrer le nouveau et le prévient. Après une passation, le
repreneur ne lisait pas le fil (403), le partant y restait, et l'acceptation du partant valait
pour le repreneur.

## Décision du porteur

« validé — porteur (2026-10-22) : passer chaque intervention par `MaintenanceRequestService::assign()` dans la transaction de la passation, en gardant le devis du partant »

Critère accordé : V1.

## Objectif

Après la passation, chaque intervention transmise est dans l'état que laisse le geste unitaire
d'assignation, à ceci près que le devis du partant reste.

## Delta à produire

- [x] `MaintenanceRequestService::assign()` reçoit `keepQuote` (défaut `false`) : vrai, le devis du
      précédent n'est ni archivé ni vidé, et le statut ne revient pas en `quote_requested`.
- [x] `AgentHandoverService::move()`, catégorie `maintenance` : chaque intervention passe par
      `assign(…, keepQuote: true)`, vers le repreneur s'il est éligible, vers personne sinon.

## Critères d'acceptation

- [x] AC1 — Intervention assignée au partant par `assign()` (fil ouvert), acceptée, en
      `quote_submitted` avec un devis de 150 000 ; passation `successor_id` → 200,
      `assigned_to` = repreneur, `accepted_at` nul, statut et devis inchangés ;
      `ConversationAccess::allows()` vrai pour le repreneur et faux pour le partant ;
      `GET /api/conversations/{id}/messages` par le repreneur → 200.
- [x] AC2 — Les autres passations et le chemin d'assignation unitaire gardent leur comportement.

## Hypothèses

- « En gardant le devis du partant » s'entend du devis entier : champs `quote_*`, `actual_cost`,
  trace de l'accord du bailleur (`forgetOwnerCost` n'est pas appelé) et statut. Seuls
  l'assigné, l'acceptation et l'événement changent.
- La branche « repreneur inéligible » (appel direct du service seulement) passe aussi par
  `assign()`, vers personne, devis gardé : la décision vise chaque intervention.
- `MaintenanceStatusChanged` est `ShouldDispatchAfterCommit` : il part après la transaction de la
  passation, et rien ne part si elle est annulée (le test `a_failure_halfway_moves_nothing` reste vert).

## Notes d'implémentation

- Ablation 1 : l'appel à `assign()` remplacé par l'écriture directe d'`assigned_to` → le test neuf
  rougit sur `accepted_at` ; remise → vert.
- Ablation 2 : `keepQuote` ignoré dans `assign()` → le test rougit sur le statut (revenu en
  `quote_requested`) ; remise → vert.
