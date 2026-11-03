---
id: TCK-1316
title: "Le créateur du bien n'est prévenu que s'il est bailleur ou personnel actif de l'agence"
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
    - "docs/features.md#23-notifications"
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#18-maintenance--interventions"
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#3-property"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-126--destinataires-déquipe-choisis-sans-juger-le-profil-actif"
tags: [api, notifications, profils, biens, pistes]
---

## Contexte

Réf : **P126.04** du fichier de pistes, `validé`.

`properties.user_id` est le créateur du bien : sur un bien d'agence, souvent l'agent qui l'a saisi.
Six sites le prévenaient comme bailleur sans juger son profil, et l'agent suspendu ou parti de
l'agence continuait de recevoir les avis du bien.

## Décision du porteur

« validé — porteur (2026-10-22) : une méthode unique qui garde `properties.user_id` s'il est `estProprietaire` ou personnel actif de l'agence du bien (`isStaffAt`), et l'écarte sinon, appliquée aux sites listés hors devis `awaiting_owner` »

Critère accordé : V7.

## Objectif

Une méthode unique décide si le créateur du bien est destinataire, et les sites listés l'appellent.

## Delta à produire

- [x] `PrimaryPropertyContact::createurDestinataire(Property): ?User` : le créateur s'il est
      `estProprietaire`, ou personnel actif de l'agence du bien (`isStaffAt`) ; `null` sinon.
- [x] Sites : `MaintenanceParticipants::principals`, `BookingStakeholders::for` et
      `propertyTeam`, `ReviewNotifier::received` (avis sur un bien), l'avis d'échec d'un flux
      iCal (`PropertyCalendarSyncService`), `BookingExpirationService::resolveAgent` (premier
      choix), l'avis `MaintenanceCreated` (`MaintenanceRequestController::store`).
- [x] Tests : `CreateurDuBienDestinataireTest`, et un cas dans `SyncPropertyCalendarFeedsTest`.

## Critères d'acceptation

- [x] AC1 — Créateur agent `suspended`, ou sans profil dans l'agence du bien → `null` ; agent
      actif, bailleur actif de l'agence, particulier d'un bien sans agence → lui-même.
- [x] AC2 — Créateur suspendu : absent des donneurs d'ordre de l'intervention, de l'équipe du bien
      et des parties de la réservation ; aucun `review.received`, aucun avis d'échec iCal, aucun
      `maintenance.created`.
- [x] AC3 — Réservation expirée sur un bien au créateur suspendu → l'avis « agent » part au repli
      existant (l'auteur de la réservation, agent actif).

## Hors périmètre

- Le devis `awaiting_owner` (`NotifyMaintenanceParticipants`), exclu par la décision.
- Tout repli neuf : chaque site garde le sien, ou n'en a pas.

## Notes d'implémentation

- Hypothèse : « personnel actif » est `MembershipCapabilityResolver::isStaffAt`, à la lettre de la
  décision, sans la joignabilité de `PersonnelDeLAgence::estPersonnel` ; le compte bloqué relève
  de P88.04. Sur un bien sans agence, `estProprietaire` exige déjà le compte joignable : un
  particulier bloqué n'est plus prévenu par ces sites.
- Ablation : les sept fichiers de `app/` remis à `HEAD` → 6 rouges sur 6 dans
  `CreateurDuBienDestinataireTest` ; `PropertyCalendarSyncService.php` seul remis → 1 rouge dans
  `SyncPropertyCalendarFeedsTest` ; correctif remis → tout vert.
