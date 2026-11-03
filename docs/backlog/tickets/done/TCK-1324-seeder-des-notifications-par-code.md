---
id: TCK-1324
title: "Le seeder des notifications écrit par code et paramètres bruts, comme l'application"
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
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#12-appnotification-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-128--dates-des-charges-utiles-de-notification-et-leur-lecture-par-le-front"
tags: [back, seeders, notifications, i18n, pistes]
---

## Contexte

Réf : **P128.04** du fichier de pistes, `validé (délégué)` (V7 accordé).

Décision du porteur (déléguée) : le seeder écrit chaque notification par `code` et paramètres bruts, comme `AppDatabaseChannel` : chaque famille prend le code que l'application émet pour le même événement et le même destinataire, avec les paramètres que pose son émetteur réel ; la famille « Nouveau bail », qui n'a aucun code au catalogue, est retirée du seeder, et toute autre famille sans code apparié aussi ; aucun code ni texte neuf ; garde : un test du seeder qui exige un `code` du catalogue sur chaque ligne qu'il crée ; reste : un code « bail créé » et son texte, s'il en faut un

Reste à faire : un code « bail créé » et son texte, s'il en faut un.

`AppNotificationSeeder` écrivait 9 409 lignes sans `code`, en phrases françaises figées : la cloche
retombait sur elles et le rendu par code n'apparaissait jamais en développement ni en démonstration.

## Objectif utilisateur

En développement et en préproduction, la cloche montre des notifications rendues comme en
production, dans la langue de l'écran.

## Contrat de données

Aucun changement de schéma. Les lignes ont la forme que `NotificationService::send` écrit
(`code`, `params`, `target`, `type` du code, titre et corps rendus dans la langue du destinataire),
datées du moment de l'événement simulé.

## Delta à produire

- [x] `AppNotificationSeeder` : trois familles appariées, écrites par code :
  - visite → son agent : `visit.requested`, paramètres de `VisitNotifier` ;
  - paiement de loyer reçu → le bailleur : `lease_payment.received_landlord`, paramètres de
    `LeasePaymentService` ;
  - intervention attribuée → l'attributaire : `maintenance.assigned`, paramètres de
    `NotifyMaintenanceParticipants`.
- [x] Retrait des familles sans code apparié (ci-dessous).
- [x] Test `AppNotificationSeederTest`.

## Critères d'acceptation

- [x] AC1 — chaque ligne créée porte un code du catalogue, le `type` de ce code, ses paramètres
  déclarés et une cible.
- [x] AC2 — aucune famille « Nouveau bail » ni ligne sans code.

## Hors périmètre

- Un code « bail créé » et son texte (reste du porteur).
- Les classes historiques sans code (P75.05).

## Notes d'implémentation

- Hypothèses d'appariement, la décision demandant « même événement et même destinataire » :
  - « Rappel de paiement » allait au **bailleur** trois jours avant l'échéance ; l'application ne
    rappelle l'échéance qu'au locataire (`SendLeasePaymentReminders`) : retirée ;
  - « Nouvelle réservation » allait à l'**auteur** de la réservation, que `NotifyOnBookingRequested`
    exclut : retirée ;
  - « Demande de maintenance » allait à l'attributaire, à défaut au demandeur : l'attributaire
    reçoit `maintenance.assigned` ; le demandeur n'est notifié d'aucune création, ses lignes sont
    retirées.
- Les lignes ne portent plus `data` ni `referenceable_*` : `NotificationService::send` n'en écrit pas
  pour un code.
- Ablation : seeder rendu à `origin/pre-dev` → rouge (« ligne #1 sans code du catalogue (Paiement
  reçu) ») ; correctif remis → vert.
