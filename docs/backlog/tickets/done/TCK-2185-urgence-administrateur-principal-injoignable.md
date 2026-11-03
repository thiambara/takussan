---
id: TCK-2185
title: "L'alerte et l'escalade d'urgence partent aux administrateurs quand le principal est injoignable"
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
  features:
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#21-maintenancerequest-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-225--ce-que-lagence-attache-à-son-administrateur-principal-quand-ce-compte-part"
tags: [api, maintenance, notifications, pistes]
---

## Objectif

L'alerte d'urgence (`MaintenanceRequestController::sendUrgentAlert`) et l'escalade
(`EscalateUrgentMaintenanceJob`) partent à l'administrateur principal s'il est joignable, et sinon
aux administrateurs que rend `AdminsDeLAgence::destinataires`.

## Contexte

Réf : **P225.01** du fichier de pistes, `validé (délégué)` (V7 accordé).

Les deux sites ne lisaient que `agency.primaryAdmin` : effacé (supprimé en douceur), la relation
est nulle et l'escalade ne partait à personne, puis se marquait faite ; bloqué, l'avis partait au
compte fermé par `Notification::send()`, qui ne passe pas par le filtre de `NotificationService`.

## Décision du porteur (déléguée)

validé (délégué) — l'alerte d'urgence (`MaintenanceRequestController::sendUrgentAlert`) et l'escalade (`EscalateUrgentMaintenanceJob`) partent à l'assigné et à l'administrateur principal s'il est joignable (`PrimaryPropertyContact::joignable`), et sinon aux administrateurs que rend `AdminsDeLAgence::destinataires` ; `escalated_at` reste posé comme aujourd'hui, et quand aucun avis n'est parti, un avertissement au journal nomme l'intervention et l'agence ; test : administrateur principal effacé puis bloqué, co-administrateur actif → l'avis part au co-administrateur, et 0 au compte bloqué ; reste : adresser ces avis à tous les administrateurs joignables même quand l'administrateur principal l'est, ce que TCK-1991 n'écrit pas

## Reste à faire

adresser ces avis à tous les administrateurs joignables même quand l'administrateur principal l'est, ce que TCK-1991 n'écrit pas

## Hypothèses (mode sans humain)

- L'escalade ne s'adresse pas à l'assigné (elle ne le faisait pas) : la décision cite l'assigné
  pour l'alerte, qui le garde.

## Delta à produire

- [x] `AdminsDeLAgence::principalSinonDestinataires(?Agency)` : la règle, écrite une fois (relue
  par P225.02).
- [x] `EscalateUrgentMaintenanceJob` : destinataires par cette règle ; sans destinataire,
  `Log::warning` avec `maintenance_request_id` et `agency_id`, `escalated_at` posé.
- [x] `sendUrgentAlert` : l'assigné plus cette règle.
- [x] `UrgenceSansAdministrateurPrincipalJoignableTest`.

## Critères d'acceptation

- [x] AC1 — principal effacé : l'escalade part au co-administrateur, `escalated_at` posé.
- [x] AC2 — principal bloqué : escalade et alerte au co-administrateur, 0 au compte bloqué.
- [x] AC3 — principal joignable : seul destinataire, comme TCK-1991.
- [x] AC4 — aucun administrateur joignable : aucun avis, `escalated_at` posé, un avertissement
  qui nomme l'intervention et l'agence.

## Notes d'implémentation

- Avant correctif : 4 rouges sur 5 (le témoin passe).
- Ablation : la règle remise à « le principal tel quel » → 4 rouges ; remise → 5 verts.
