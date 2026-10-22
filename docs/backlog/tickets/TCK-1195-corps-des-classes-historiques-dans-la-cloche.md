---
id: TCK-1195
title: "Le corps que `toArray()` écrit arrive dans la colonne `body` de la cloche"
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
tags: [back, notifications, cloche, pistes]
---

## Contexte

Réf : **P75.03** du fichier de pistes, `validé` (V7 accordé).

Sans `toAppNotification()`, `AppDatabaseChannel::payload()` ne retient de `toArray()` que
`title` : la colonne `body` reste nulle. `TenantWelcomeNotification`,
`TenantInventoryReminderNotification` et `AgentTenantInventoryReminderNotification` écrivent
pourtant `body`, et `BookingExpiredNotification` `message`. La cloche lit `body ?? content`,
jamais `data` : le texte n'y paraît pas.

## Décision du porteur

> validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

**Choix retenu : la voie (a)**, faire lire `body` par le canal quand `toArray()` le porte, et
renommer `message` en `body`. La `Piste` ne recommande aucune des deux voies ; (a) est la plus
étroite : aucun code ni texte neuf, le corps rendu est celui que l'e-mail porte déjà. La
recommandation (b) du délégué, porter ces classes au catalogue `NotificationCode`, est le
« portage au catalogue » que le reste de P75.05 (TCK-1134) garde déjà au porteur : ces corps
sont, comme leur titre aujourd'hui, figés dans la langue de l'envoi jusqu'à ce portage.

## Objectif utilisateur

Le locataire qui ouvre la cloche lit, sous « Bienvenue chez vous — bail LS-… », le texte qui suit ;
de même pour les relances d'état des lieux et l'expiration d'une réservation.

## Delta à produire

- [x] `AppDatabaseChannel::payload()` range `toArray()['body']` (chaîne) dans `body`.
- [x] `BookingExpiredNotification::toArray()` : `message` devient `body`.
- [x] Garde dans `tests/Feature/Notifications/AppDatabaseChannelTest.php`.

## Critères d'acceptation

- [x] AC1 — pour les quatre classes, la ligne `app_notifications` porte en `body` le `body` de `toArray()`.
- [x] AC2 — aucune classe de `AppDatabaseChannel::TYPES` sans `toAppNotification()` ne range son
      corps sous `message` ou `content`.

## Hors périmètre

- Le portage de ces classes au catalogue `NotificationCode` (langue de lecture) : reste de P75.05.
- Les interrupteurs de ces classes : P75.02 (TCK-1193).

## Notes d'implémentation

- Ablation : canal et classe rendus à `91157960d` → 2 rouges (corps nul dans la colonne pour la
  bienvenue, `message` relevé dans `BookingExpiredNotification`) ; correctif remis → 7/7.
- `data` garde le `body` : la colonne s'ajoute, rien ne sort de `data`. Aucun lecteur de
  `data.message` (`grep` sur `app`, `tests`, `takussan-web/src`).
- Le canal ne range un corps que s'il est une chaîne non vide : une chaîne vide ne remplacerait
  pas utilement le `null` que la cloche sait traiter.
