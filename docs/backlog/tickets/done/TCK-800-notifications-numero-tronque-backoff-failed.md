---
id: TCK-800
title: "Notifications : numéro réduit à son suffixe dans les journaux, `backoff` et `failed()` sur `CodedNotification`"
status: done
phase: P2
family: back
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-11--notifications--doublons-préférences-échecs"
tags: [back, notifications, sms, whatsapp, pistes]
---

## Contexte

Réf : **P11.10** du fichier de pistes, `validé` par le porteur (critère accordé : V3).

`SmsChannel` et `WhatsappChannel` écrivent le numéro entier au journal quand il est invalide,
quand le reste du dépôt n'en garde que le suffixe (`PhoneVerificationService`). `CodedNotification`
n'a ni `backoff()` ni `failed()` : le worker (`--tries=3`, sans délai) épuise ses trois essais en
quelques secondes sur une panne brève du transport, et l'échec final ne laisse aucune trace propre
à la notification.

## Décision du porteur

ne journaliser que les 4 derniers chiffres des numéros, `backoff` et un `failed()` qui journalise

## Objectif utilisateur

Un incident d'envoi se diagnostique sans que le journal garde le numéro du destinataire, et une
panne de quelques secondes ne fait plus perdre la notification.

## Contraintes strictes

- `backoff` = `[60, 300, 900]`, la valeur de la `Piste`. Le nombre d'essais reste celui du worker.
- `failed()` journalise le code, le canal et l'identifiant de la ligne `app_notifications`, jamais
  les paramètres ni le message de l'exception (`SafeExceptionContext`).
- Le canal d'une copie en file se retient au moment de la mise en file : Laravel crée une copie
  par canal, et `failed()` ne reçoit que l'exception.

## Delta à produire

- [x] `SmsChannel`, `WhatsappChannel` : `phone_suffix` au lieu de `phone`.
- [x] `CodedNotification::backoff()`, `failed()`, et le canal retenu par `middleware()`.
- [x] Tests : `NotificationFailureLoggingTest`.

## Critères d'acceptation

- [x] AC1 — Un numéro invalide se journalise par ses 4 derniers caractères, sur les deux canaux.
- [x] AC2 — Le job en file d'une `CodedNotification` rend `[60, 300, 900]` en `backoff()`.
- [x] AC3 — Son `failed()` écrit un `error` avec le code, le canal du job et l'identifiant de la
      notification, sans le message de l'exception.

## Hors périmètre

- `LogSmsDriver` et `LogWhatsappDriver` écrivent le numéro entier : pilotes de développement,
  dont c'est l'objet (TCK-589).
- Les autres notifications en file que `CodedNotification`.

## Notes d'implémentation

- **Ablation** (`NotificationFailureLoggingTest`, 2 tests) : `SmsChannel` remis seul → 1 rouge,
  `WhatsappChannel` seul → 1 rouge, `backoff()` vide → 1 rouge, canal non retenu → 1 rouge,
  `failed()` retiré → 1 rouge. Correctif remis : 2 verts, et `tests/Feature/Notifications`,
  `tests/Feature/Services/Whatsapp`, `SmsChannelTest` verts (147 tests).
- **Piège** : `failed()` ne reçoit que l'exception, et `SendQueuedNotifications` ne passe pas son
  canal à la notification. Le canal se retient dans `middleware($notifiable, $channel)`, que
  Laravel appelle sur chaque copie au moment de la mise en file ; la propriété est sérialisée
  avec la copie (chiffrée, `ShouldBeEncrypted`).
- `SafeExceptionContext::of()` a sa propre clé `code` (celle de l'exception) : seules `exception`
  et `at` en sont reprises, pour que `code` reste celui de la notification.
