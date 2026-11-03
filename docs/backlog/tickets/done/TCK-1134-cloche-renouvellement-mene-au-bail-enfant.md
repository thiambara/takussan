---
id: TCK-1134
title: "La ligne de cloche du renouvellement d'un bail mène au bail enfant"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#12-appnotification-️"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-75--classes-notification-historiques-hors-notificationcode"
tags: [back, notifications, baux, pistes]
---

## Contexte

Réf : **P75.05** du fichier de pistes, `validé (délégué)` (V7 accordé, pour la seule cible du
renouvellement : écrite par TCK-588, C11, et déjà servie par `NotificationTarget::PATHS`).

`LeaseRenewedNotification::toArray()` range `parent_lease_id` et `child_lease_id`, qu'aucune
règle de `NotificationTarget::derive()` ne lit : la ligne de cloche n'a pas de cible et n'est pas
un lien.

## Décision du porteur (déléguée)

> validé (délégué) — ajouter `lease_id` (le bail enfant) aux données de `LeaseRenewedNotification::toArray()`, pour que la ligne de cloche du renouvellement mène à `/app/leases/{id}` par `NotificationTarget::derive()` ; test : la ressource de la ligne rend la cible `lease` du bail enfant ; reste : les cibles des factures, des tâches, des alertes de seuil, des `AgencyUpgrade*` et des `SuperAdmin*Broadcast`, le titre du rappel de tâche, et la langue figée des classes sans code (portage au catalogue), au porteur

## Reste à faire

- les cibles des factures, des tâches, des alertes de seuil, des `AgencyUpgrade*` et des `SuperAdmin*Broadcast`, le titre du rappel de tâche, et la langue figée des classes sans code (portage au catalogue), au porteur

## Objectif utilisateur

Un locataire dont le bail est renouvelé ouvre, d'un clic dans la cloche, la fiche du nouveau bail.

## Delta à produire

- [x] `lease_id` (le bail enfant) dans `LeaseRenewedNotification::toArray()`.
- [x] Test dans `tests/Feature/Notifications/LeaseRenewedNotificationTest.php`.

## Critères d'acceptation

- [x] AC1 — après envoi au locataire, `AppNotificationResource` rend pour sa ligne la cible
      `{kind: lease, id: <bail enfant>, path: /app/leases/<bail enfant>}`.

## Hors périmètre

- Tout ce que liste « Reste à faire », gardé par le porteur.

## Notes d'implémentation

- `parent_lease_id` et `child_lease_id` restent dans les données : rien ne les retire, la clé neuve
  s'ajoute.
- Ablation : la notification rendue à `3c6c8301f` → 1 rouge (cible nulle) ; correctif remis → 4/4.
