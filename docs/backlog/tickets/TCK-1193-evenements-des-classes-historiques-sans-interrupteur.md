---
id: TCK-1193
title: "Les classes historiques ne passent plus au résolveur un événement sans interrupteur"
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
  models:
    - "docs/models-spec.md#12-appnotification-️"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-75--classes-notification-historiques-hors-notificationcode"
tags: [back, notifications, preferences, pistes]
---

## Contexte

Réf : **P75.02** du fichier de pistes, `validé` (V7 accordé).

Cinq événements — `booking_expired`, `booking_expired_agent`, `lease_deposit_refunded`,
`tenant_welcomed`, `property_moderation` — sont passés à `PreferenceResolver::shouldSend()` par
`BookingExpiredNotification`, `LeaseDepositRefundNotification`, `TenantWelcomeNotification`,
`PropertyApprovedNotification` et `PropertyRejectedNotification`. Aucun n'est dans
`PreferenceResolver::EVENTS` : `updateMany()` les ignore, l'écran n'a pas de case, et l'e-mail part
toujours, alors que les docblocks disent qu'il obéit aux préférences.

## Décision du porteur

> validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

**Choix retenu** (la recommandation écrite dans l'entrée, par le délégué ; c'est aussi la voie la
plus étroite : aucune case neuve, aucun libellé neuf) :

- `property_moderation` : envoi non désactivable, sans résolveur — déjà décidé par TCK-782
  (`NotificationCode::PropertyApproved/PropertyRejected->preferenceEvent()` → `null`) ;
- `booking_expired` (client) : sous l'interrupteur existant `booking_status_changed` ;
- `booking_expired_agent` : sous l'interrupteur existant `booking_request` ;
- `tenant_welcomed` et `lease_deposit_refunded` : envois transactionnels uniques, non
  désactivables (précédent de TCK-593 pour une somme rendue), docblocks corrigés ;
- `LeasePaymentLateFeeNotification` reste sous `lease_payment_overdue` (vérifié : événement de
  `EVENTS`, l'e-mail de pénalité suit la case des relances d'impayé).

Pour les envois non désactivables, `database`, `mail` et `broadcast` partent sans lire le
résolveur : c'est ce qui partait déjà (ces événements n'ayant aucune ligne de préférence possible,
`shouldSend()` rendait les défauts, vrais pour ces trois canaux). Le comportement de ces trois
classes ne change donc pas ; seul l'appel trompeur disparaît.

## Objectif utilisateur

Un client qui coupe l'e-mail « changement de statut de réservation » ne reçoit plus l'e-mail
d'expiration de sa demande ; les autres envois sans case se lisent comme tels dans le code.

## Delta à produire

- [x] `BookingExpiredNotification::via()` lit `booking_status_changed` (client) et `booking_request` (agent).
- [x] `TenantWelcomeNotification`, `LeaseDepositRefundNotification`, `PropertyApprovedNotification`,
      `PropertyRejectedNotification` : `via()` sans résolveur, constante `EVENT_TYPE` retirée, docblock juste.
- [x] Garde : `tests/Unit/Notifications/PreferenceEventsOfClassesTest.php`.

## Critères d'acceptation

- [x] AC1 — toute constante `EVENT_TYPE*` d'une classe de `app/Notifications` et tout littéral passé
      à `shouldSend()` figurent dans `PreferenceResolver::EVENTS` ou `CRITICAL_EVENTS`.
- [x] AC2 — `booking_status_changed`/`email` coupé → l'expiration ne part pas par e-mail au client ;
      sans préférence, elle part.
- [x] AC3 — un résolveur qui refuse tout ne retire ni `database` ni `mail` aux quatre envois non désactivables.

## Hors périmètre

- La colonne Push (`broadcast`) et son transport : P13.06.
- Le corps de la cloche de ces classes : P75.03 (TCK-1195).

## Notes d'implémentation

- Ablation : les cinq classes rendues à `91157960d` → 6 rouges sur 7 (garde statique sur
  `booking_expired`, e-mail d'expiration non coupé, quatre envois qui lisaient le résolveur) ;
  correctif remis → 7/7.
- Les constantes `EVENT_TYPE` des quatre envois non désactivables sont retirées : aucun autre
  lecteur (`grep -rn` sur `app`, `tests`, `routes`, `config`, `takussan-web/src`). Pour les garder
  sous une constante, la garde exigerait une liste fermée « sans interrupteur ».
- `BookingExpiredNotification` garde les noms `EVENT_TYPE_TENANT`/`EVENT_TYPE_AGENT`, qui valent
  désormais les interrupteurs existants.
