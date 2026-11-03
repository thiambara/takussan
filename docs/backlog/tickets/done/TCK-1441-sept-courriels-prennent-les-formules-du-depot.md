---
id: TCK-1441
title: "Sept courriels prennent les formules d'appel et de signature du dépôt"
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
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-155--courriels-que-la-suite-ne-rend-jamais"
tags: [back, notifications, courriels, pistes]
---

## Contexte

Réf : **P155.05** du fichier de pistes, `validé (délégué)` (critère V7 accordé).

Les deux avis de cooptation super-admin s'ouvraient par `notifications.salutation` (« L'équipe
Takussan » en tête et en pied) ; les avis de passage en agence, l'export de rapport et l'alerte de
seuil ne posaient ni `greeting` ni `salutation`, et prenaient les formules du gabarit de Laravel.

## Décision du porteur (déléguée)

validé (délégué) — `->greeting(__('notifications.greeting'))` dans `SuperAdminInvitedBroadcast` et `SuperAdminAcceptedBroadcast`, et `greeting(__('notifications.greeting'))` plus `salutation(__('notifications.salutation'))` dans `AgencyUpgradeApprovedNotification`, `AgencyUpgradeRejectedNotification`, `AgencyUpgradeRequestSubmittedNotification`, `ReportExportReadyNotification` et `ThresholdAlertTriggered`, sans clé neuve

## Delta à produire

- [x] `SuperAdminInvitedBroadcast`, `SuperAdminAcceptedBroadcast` : `greeting(__('notifications.greeting'))`.
- [x] `AgencyUpgradeApprovedNotification`, `AgencyUpgradeRejectedNotification`,
  `AgencyUpgradeRequestSubmittedNotification`, `ReportExportReadyNotification`,
  `ThresholdAlertTriggered` : `greeting` et `salutation` du dépôt.
- [x] `tests/Feature/Notifications/FormulesDesCourrielsTest.php`.

## Critères d'acceptation

- [x] AC1 — les sept `toMail()`, sous `fr`, `en` et `wo` : `greeting` = `notifications.greeting`,
  `salutation` = `notifications.salutation`. Aucune clé neuve.

## Hors périmètre

- Une garde générale sur tous les courriels : P155.02, non prise dans ce lot.

## Notes d'implémentation

- Ablation : les sept notifications remises à l'état d'avant → rouge, remises → vert (42 assertions).
