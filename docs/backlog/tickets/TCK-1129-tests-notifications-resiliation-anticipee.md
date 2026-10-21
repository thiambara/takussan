---
id: TCK-1129
title: "La résiliation anticipée et la révision de loyer ont un test qui asserte leurs lignes de cloche"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#14-lease-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-75--classes-notification-historiques-hors-notificationcode"
tags: [back, lease, notifications, tests, pistes]
---

## Contexte

Réf : **P75.04** du fichier de pistes, `retenu · autonome` (A5 : tests seuls, sans changer de code
ni de seuil).

Les trois classes qui exercent la résiliation anticipée posent `Notification::fake()` et
n'assertent aucun envoi ; `LeaseEarlyTerminationNotification`, `NotifyOnEarlyTermination`,
`LeaseRentReviewedNotification` et `NotifyTenantOfRentReview` n'étaient cités par aucun test qui
vérifie un destinataire, un titre ou une cible.

## Objectif utilisateur

Un changement de qui reçoit la résiliation ou la révision de loyer, de leur titre ou de la page
qu'elles ouvrent rougit la suite.

## Delta à produire

- [x] `tests/Feature/Notifications/LeaseEarlyTerminationDeliveryTest.php`, sans `Notification::fake()`.

## Critères d'acceptation

- [x] AC1 — `requested`, `cancelled` et `confirmed` écrivent une ligne de cloche chez le locataire
      (compte rattaché au client) et chez le bailleur, et chez personne d'autre ; titre traduit
      dans la langue du destinataire ; cible `lease` du bail.
- [x] AC2 — un locataire sans compte : le bailleur seul.
- [x] AC3 — la révision de loyer : le locataire seul, même titre et même cible.

## Hors périmètre

- Le courriel (`toMail()`), déjà couvert pour les montants par `NotificationAmountsTest`.
- Le docblock de `EarlyTerminationServiceTest::setUp()`, qui dit que le dépôt n'a pas de table de
  notifications (périmé : le canal `database` écrit dans `app_notifications`) ; signalé, non touché.

## Notes d'implémentation

- Ablation, trois retraits du code gardé, chacun rendu ensuite : bailleur retiré des destinataires
  de `NotifyOnEarlyTermination` → 3 rouges sur 4 ; `lease_id` retiré de
  `LeaseEarlyTerminationNotification::toArray()` (plus de cible) → 3 rouges ; `NotifyTenantOfRentReview`
  muet → 1 rouge (la révision).
- Piège : le titre de la ligne est rendu dans la langue du **destinataire**, pas dans celle du
  test ; comparer à `__($cle, $params, $user->preferredLocale())`.
- La confirmation exige la date d'effet atteinte et la pénalité payée : la facture est passée à
  `paid` et l'horloge avancée de 46 jours.
