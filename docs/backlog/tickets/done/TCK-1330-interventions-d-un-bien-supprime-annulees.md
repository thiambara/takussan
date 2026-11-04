---
id: TCK-1330
title: "Supprimer un bien annule ses interventions non terminées, motif tracé"
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
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-130--fiches-client-garant-et-bien-supprimées-en-douceur-et-encore-citées"
tags: [api, maintenance, suppression-douce, pistes]
---

## Contexte

Réf : **P130.03** du fichier de pistes, `validé`.

Un bien supprimé (suppression douce) laisse ses interventions ouvertes. L'équipe de l'agence ne
les voit plus (`MaintenanceRequestPolicy::view` et `scopeVisibleTo` passent par le bien, nul sous
la portée `SoftDeletes`), le locataire demandeur les voit encore `open`, et plus personne ne peut
les clore.

## Décision du porteur

« validé — porteur (2026-10-22) : annuler les interventions non terminées à la suppression du bien (observateur `deleted`, motif tracé) »

Critère accordé : V2 et V7 (le dernier classement cite les deux).

## Objectif

À la suppression d'un bien, chaque intervention non terminée passe à `cancelled`, avec une trace
qui porte le motif.

## Delta à produire

- [x] `PropertyObserver::deleted` : chaque intervention du bien que la machine d'état laisse
      aller à `cancelled` y passe par `MaintenanceRequestService::transition()` (contexte
      `reason = property_deleted`), et une ligne d'activité `maintenance.cancelled_property_deleted`
      porte le motif et l'id du bien.
- [x] Test `MaintenanceDUnBienSupprimeTest`.

## Critères d'acceptation

- [x] AC1 — Interventions `open` et `in_progress` d'un bien supprimé → `cancelled`.
- [x] AC2 — `completed` et `closed` ne bougent pas ; l'intervention d'un autre bien non plus.
- [x] AC3 — Une ligne d'activité par annulation, motif `property_deleted` et id du bien.
- [x] AC4 — Le locataire demandeur lit `cancelled`.

## Hypothèses (mode sans humain)

- « Non terminée » se lit par la machine d'état (`MaintenanceStateMachine::TRANSITIONS`) : toute
  intervention qui peut aller à `cancelled`. Une intervention `completed` n'y va pas (travaux faits,
  en attente de la confirmation du demandeur) : elle reste `completed`, et
  `maintenance:auto-close` la ferme au bout de 7 jours.
- Le passage par `transition()` émet `MaintenanceStatusChanged` : le prestataire et le demandeur
  reçoivent l'annulation par les notifications existantes. Les donneurs d'ordre n'en reçoivent pas,
  `MaintenanceParticipants::principals` rendant vide sur un bien nul ; l'auteur de la suppression
  est l'un d'eux.

## Hors périmètre

- Réservations et visites d'un bien supprimé (P130.04, au porteur).
- Refus de supprimer un bien loué (reste de P130.02, au porteur).

## Notes d'implémentation

- Ablation : appel de `cancelOpenMaintenance()` commenté → `MaintenanceDUnBienSupprimeTest` rouge
  (statut `open` au lieu de `cancelled`) ; remis → vert.
