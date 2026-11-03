---
id: TCK-1053
title: "La demande de réservation n'ouvre plus de cases SMS et WhatsApp : `NewBookingNotification`, sans émetteur, est retirée"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#99-notificationpreference-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#les-cases-sms-et-whatsapp-de--demande-de-réservation--sont-cochables-et-ne-commandent-aucun-envoi"
tags: [back, notifications, preferences, pistes]
---

## Objectif utilisateur

La matrice des préférences ne propose plus de cases SMS et WhatsApp pour « demande de
réservation », qu'aucun envoi ne lit : l'utilisateur ne coche plus une case sans effet.

## Contexte

Réf : **P75.01** du fichier de pistes, `validé (délégué)` (critère V7 accordé).

`NewBookingNotification` n'avait aucun émetteur ; sa seule présence dans
`PreferenceResolver::MOBILE_CLASS_EVENTS` rendait l'événement `booking_request` mobile. Mesuré
avant correctif (tests de garde ci-dessous) : la matrice d'un compte au numéro vérifié rend
`booking_request|sms` et `booking_request|whatsapp` non verrouillées, et aucun envoi réel ne
porte cet événement sur mobile.

## Décision du porteur (déléguée)

> retirer `NewBookingNotification`, sans émetteur, et son entrée de `PreferenceResolver::MOBILE_CLASS_EVENTS` et de `AppDatabaseChannel::TYPES`, pour que les cases `booking_request`/`sms` et `/whatsapp` soient verrouillées `channel_unavailable` (TCK-588) ; la demande de réservation ne part pas sur mobile (TCK-590, contrainte 4) ; les tests qui l'instancient se reportent sur une classe vivante ou une classe de test ; garde : un test qui, pour chaque événement de `mobileEvents()`, exige un émetteur réel

## Hypothèses (mode sans humain)

- « émetteur réel » se lit ainsi dans la garde : pour un code, `NotificationCode::<Cas>` nommé
  dans `app/` hors de `app/Domain/Notifications/` ; pour une classe, `notify(new …)` ou
  `send(…, new …)` dans `app/`. Une instanciation qui n'envoie pas (`SavedSearchResource`
  appelle `via()`) ne compte pas.
- Les tests de `NotificationEmailTest` qui ne gardaient que la classe retirée (charge utile,
  préférence `push`, que `booking_request` n'a pas) ne se reportent pas : seuls les deux qui
  disent un comportement vivant (e-mail selon la préférence, jamais de mobile) passent sur
  `CodedNotification` et le code `booking.created`.
- Les clés `notifications.new_booking.*` des fichiers `lang/` restent : retirer du texte n'est
  pas dans la décision, et le wolof est en pause.

## Delta à produire

- [x] Retrait de `app/Notifications/NewBookingNotification.php` et de ses entrées dans
  `AppDatabaseChannel::TYPES` et `PreferenceResolver::MOBILE_CLASS_EVENTS`.
- [x] Tests reportés : `NotificationTemplateTest` (gabarit `booking_confirmed` par le code
  `booking.confirmed`), `NotificationEmailTest`, `SmsChainTimeBudgetTest`,
  `WhatsappChannelTest`.
- [x] Garde `MobileClassEventsTest::test_chaque_evenement_mobile_a_un_emetteur_reel`.
- [x] Test `NotificationPreferenceTest::test_les_cases_mobiles_de_la_demande_de_reservation_sont_verrouillees`.

## Critères d'acceptation

- [x] AC1 — `booking_request|sms` et `booking_request|whatsapp` sont verrouillées
  `channel_unavailable` ; `booking_request|email` reste ouverte.
- [x] AC2 — chaque événement de `PreferenceResolver::mobileEvents()` a un émetteur réel.
- [x] AC3 — la demande de réservation (`booking.created`) part par e-mail selon la préférence,
  jamais sur mobile.

## Hors périmètre

- Les autres événements sans interrupteur (P75.02) et la cible des lignes de cloche (P75.05).
- Les commentaires d'ADR-0032 qui citent la classe (chemin fermé).

## Notes d'implémentation

- Ablation : classe et entrées de catalogue remises → 2 rouges (garde de l'émetteur sur
  `booking_request`, cases mobiles ouvertes) ; retirées → 11 verts.
