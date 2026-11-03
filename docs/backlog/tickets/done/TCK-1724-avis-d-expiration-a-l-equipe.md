---
id: TCK-1724
title: "L'avis d'expiration d'une réservation part à toute l'équipe qui la suit, et non au seul bailleur"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-160--propertiesuser_id-lu-comme-le-bailleur-dans-une-décision-métier"
tags: [api, notifications, reservations, pistes]
---

## Contexte

Réf : **P160.04** du fichier de pistes (🟠, `validé (délégué)`). `BookingExpirationService::resolveAgent`
prenait d'abord `createurDestinataire` : sur le bien d'un bailleur de l'agence, l'avis `agent`
partait au bailleur seul, et l'agent qui suivait la réservation n'en recevait aucun (mesuré :
bailleur 1, agent 0, client 1). La demande et l'annulation, elles, préviennent toute l'équipe par
`BookingStakeholders::for` (TCK-596).

**Décision du porteur (déléguée)** : validé (délégué) — envoyer l'avis d'expiration `agent` à toute l'équipe de `BookingStakeholders::for` (auteur du personnel, collaborateurs acceptés `manager|agent`, créateur destinataire), moins le client qui garde son avis `tenant` ; le bailleur garde l'avis qu'il reçoit aujourd'hui, à la même perspective, sans avis neuf ; les replis de `resolveAgent` (auteur agent, admin principal) ne servent que si l'équipe est vide ; reste : un avis au bailleur à une perspective propre

**Reste à faire** (gardé par le porteur, non implémenté) : un avis au bailleur à une perspective propre

## Objectif utilisateur

L'équipe qui suit une réservation apprend son expiration, comme elle en a appris la demande.

## Delta à produire

- [x] `BookingExpirationService::sendNotifications` : l'avis `agent` à chaque membre de
  `BookingStakeholders::for($booking)`, moins l'utilisateur du client ; à défaut, au repli
  `resolveFallbackAgent` (auteur agent de l'agence, puis admin principal).
- [x] `tests/Feature/Notifications/ExpirationPrevientLEquipeTest.php`.

## Critères d'acceptation

- [x] AC1 — bien d'un bailleur, agent collaborateur accepté auteur de la réservation : l'agent et le
  bailleur reçoivent chacun un avis `agent`, le client un avis `tenant` et aucun avis `agent`.
- [x] AC2 — le collaborateur qui n'est pas l'auteur est prévenu aussi.
- [x] AC3 — équipe vide : l'admin principal de l'agence est prévenu.

## Hors périmètre

- Un avis au bailleur à sa propre perspective (texte neuf) : reste du porteur.

## Notes d'implémentation

- Ablation : `BookingExpirationService.php` rendu à `origin/pre-dev` → AC1 et AC2 rouges (« 0 is
  identical to 1 » pour l'agent), AC3 vert (le repli existait) ; correctif remis → 3 verts.
- Classes rejouées, vertes : `BookingResponseDeadlineTest`, `BookingCancellationNotificationTest`,
  `BookingRefundTaskTest`, `BookingOverlapAndExpirationTest`, `AgencySettingsWritableTest`,
  `ExpirePendingBookingsJobTest`, `ExpireBookingsTest`, `SafeExceptionLoggingTest`, et les classes
  de `tests/Feature/Notifications` qui citent l'avis (voir la PR).
