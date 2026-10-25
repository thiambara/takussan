---
id: TCK-2012
title: "Le passage d'intervention fixé ou déplacé par le PATCH est annoncé à toutes les parties"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-24
depends_on: [TCK-2010]
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#21-maintenancerequest-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-184--champs-hors-statut-que-le-patch-générique-écrit-alors-quun-geste-dédié-les-garde"
tags: [back, front, maintenance, notifications, i18n, pistes]
---

## Contexte

Réf : **P184.01** du fichier de pistes, `validé` (critère accordé : V7). `scheduled_at` ne
s'écrit que par le `PATCH` générique (`fill()->save()`), et seul un changement d'assigné émet un
événement. Le bloc d'assignation du front renvoie toujours l'assigné avec l'heure : changer la
seule heure n'annonçait rien au locataire ni au prestataire, et le prestataire qui fixe l'heure
n'en prévenait ni le locataire ni le bailleur.

## Décision du porteur

> validé — validation du porteur (2026-10-23) : un seul code neuf « passage prévu / déplacé » qui porte `:scheduled_at` dans le SMS, à toutes les parties sauf l'auteur ; wo recopie le français

## Objectif utilisateur

Le locataire, le prestataire et les donneurs d'ordre apprennent l'heure du passage dès qu'elle est
fixée ou déplacée, par un autre qu'eux.

## Contrat de données

- Code neuf `maintenance.schedule_changed`, paramètres `request` (texte) et `scheduled_at`
  (instant), type `maintenance`, interrupteur `maintenance_status_changed`. Textes `title`,
  `body`, `sms` (l'API) et `title`, `body` (le front) en fr et en ; `wo` = le français tel quel.
- `PATCH /api/maintenance-requests/{id}` : quand `scheduled_at` change réellement vers une heure
  non nulle, l'événement `MaintenanceScheduleChanged` part après le commit. Destinataires : le
  prestataire (s'il est encore assignable), le demandeur et les donneurs d'ordre, sauf l'auteur,
  une notification par personne.

## Delta à produire

- [x] `App\Events\Maintenance\MaintenanceScheduleChanged` (après commit).
- [x] `NotificationCode::MaintenanceScheduleChanged` et ses textes, des deux côtés.
- [x] `NotifyMaintenanceParticipants::handleScheduleChanged`.
- [x] Émission dans `MaintenanceRequestController::update`, dans la transaction de TCK-2010.
- [x] Tests `MaintenanceScheduleChangedNotificationTest`, et le code ajouté à `FormeDesDatesDeNotificationTest`.

## Critères d'acceptation

- [x] AC1 — Le bailleur envoie `{assigned_to: le même, scheduled_at: J+3}`, puis `J+5` → 2 avis au locataire, 2 au prestataire, 0 au bailleur.
- [x] AC2 — Le prestataire qui a accepté envoie `{scheduled_at: J+7}` → 1 avis au locataire, 1 au bailleur, 0 au prestataire.
- [x] AC3 — Témoin : la même heure renvoyée, ou la priorité seule → aucun avis.
- [x] AC4 — Le SMS porte `:scheduled_at` (et `:request`) dans les trois langues.

## Hypothèses (mode sans humain)

- **Canal** : le code n'est pas ajouté à `NotificationCode::mobile()`, comme les autres avis
  d'intervention. La décision fixe le texte du SMS, pas l'ouverture d'un canal mobile, qui serait
  un autre choix. Le texte est prêt si ce canal s'ouvre.
- **Heure retirée** (`scheduled_at: null`) : aucun avis. Le code annonce un passage prévu, et ne
  saurait rendre une heure absente.
- **Assigné et heure changés ensemble** : l'avis de passage part aussi, en plus de
  `maintenance.assigned` et de l'étape du demandeur. La décision dit « à toutes les parties ».

## Hors périmètre

- Les autres chemins d'écriture de `scheduled_at` : il n'y en a pas d'autre que le `PATCH`.
  Mesuré : `grep -rn "scheduled_at" app | grep -i maint`, seul `update` l'écrit (la création ne le valide pas).

## Notes d'implémentation

- Événement dédié plutôt qu'une cause de plus de `MaintenanceStatusChanged` : ce dernier est lu
  aussi par `SyncMaintenanceConversation` et l'observateur de facture, qui n'ont rien à faire d'une
  heure.
- `handleScheduleChanged` est enregistré par la découverte d'événements (`handle*`), sans `listen()`.
  `EventListenerDuplicationTest` reste vert.
- Ablation : émission neutralisée → AC1 et AC2 rouges ; remise → 5 verts. Retirer du contrôleur
  la condition « heure non nulle » laisse vert, parce que l'écouteur rend tôt sur une heure nulle :
  la double borne est voulue, et seule celle de l'écouteur est gardée par un test.
