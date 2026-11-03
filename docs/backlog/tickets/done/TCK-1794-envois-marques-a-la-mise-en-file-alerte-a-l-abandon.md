---
id: TCK-1794
title: "Bienvenue, rappels de tâche et d'état des lieux, relance de facture : l'abandon d'un envoi déjà marqué « envoyé » écrit une activité alertable"
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
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-142--notifications-et-écouteurs-en-file-sans-backoff-ni-failed-hors-codednotification"
tags: [api, notifications, file, alertes, pistes]
---

## Contexte

Réf : **P142.02** du fichier de pistes, `validé`.

Quatre appelants posent leur marque « envoyé » dès la mise en file de la notification :
`tenant_welcomed_at` (`SendTenantWelcomeNotification`), le marqueur de rappel d'une tâche
(`SendTaskDueReminders`), `reminders_sent` d'une checklist (`RemindTenantOnboarding`), les
compteurs et l'activité `invoice_reminder_sent` d'une facture (`OverdueReminderService`). Chaque
lecteur saute ce que sa marque couvre : un envoi abandonné par le worker ne repart jamais, et la
trace dit qu'il est parti. Depuis TCK-1352, ces notifications ont un `backoff` et un `failed()`
qui journalise (`RetriesWithBackoff`), mais rien n'alerte.

## Décision du porteur

« validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket »

Critère accordé : V7 (classement du mesureur, « V1 en bordure »).

## Choix de l'implémenteur (voie la plus étroite)

L'entrée ne porte pas de recommandation du délégué. La `Piste` propose trois voies : un
`failed()` qui retire ou corrige la marque, un `failed()` qui écrit une activité alertable, ou une
marque posée par la notification après l'envoi. **Retenue : l'activité alertable**, la seule qui
ne change ni ce que reçoit un destinataire, ni la règle d'une relance de facture, ni le contrat
d'idempotence que TCK-1394 a posé pour la bienvenue (« mieux vaut une bienvenue perdue que
deux »). Les deux autres renvoient un e-mail et, pour un rappel à plusieurs destinataires ou une
notification à plusieurs canaux, en doublent une partie : ce sont des choix plus larges.

## Hypothèses (mode sans humain)

- L'événement est `ops_critical_job_failed`, déjà au catalogue `AlertableEvents`, déjà écrit par
  les jobs (TCK-772) et les écouteurs (TCK-1392) dont l'effet n'a pas d'autre chemin ; ses
  propriétés gagnent `channel`, et l'activité est rattachée à l'objet de l'envoi (bail, tâche,
  facture) pour que l'exploitation sache quoi renvoyer.
- Chaque canal a sa copie en file : l'alerte vaut pour le canal abandonné, quel qu'il soit.

## Objectif

L'abandon d'un envoi que sa marque dit parti ne passe plus inaperçu : l'exploitation est
prévenue dès le premier, avec la notification, le canal et l'objet.

## Delta à produire

- [x] Trait `App\Notifications\Concerns\AlertsWhenMarkedDeliveryFails` : reprend
      `RetriesWithBackoff` (délai, journal), et son `failed()` écrit en plus l'activité alertable.
- [x] Employé par `TenantWelcomeNotification`, `TaskDueReminderNotification`,
      `TenantInventoryReminderNotification`, `AgentTenantInventoryReminderNotification` et
      `InvoiceOverdueReminderNotification`, chacune désignant son objet (`sujetDeLEnvoi()`).
- [x] Test `tests/Feature/Notifications/EnvoisMarquesEnEchecTest.php`.

## Critères d'acceptation

- [x] AC1 — Pour chacune des cinq notifications, le `failed()` de la copie e-mail mise en file
      (job `SendQueuedNotifications` sérialisé) écrit une activité `ops_critical_job_failed` qui
      nomme la notification, le canal `mail` et la classe de l'exception, rattachée à l'objet.
- [x] AC2 — Le message de l'exception n'y entre pas (ADR-0044 § 2).
- [x] AC3 — `backoff()` et le journal de l'échec restent (`NotificationsEnFileTest`,
      `NotificationEnFileEchecTest`).

## Reste à faire

- Le renvoi d'un envoi abandonné (marque retirée par `failed()`, ou posée par la notification
  après l'envoi) : voie plus large, non retenue.

## Hors périmètre

- Le rappel J-7 de suppression (P142.03, TCK-1390) et le résumé (P111.04).

## Notes d'implémentation

- Le `failed()` de `RetriesWithBackoff` est repris sous un alias dans le trait, comme
  `AccountDeletionReminderNotification` (TCK-1390) : le journal reste, la garde
  `NotificationsEnFileTest` voit toujours `backoff()` et `failed()`.
- Le canal vient de `queuedChannel`, posé par `middleware()` à la mise en file et sérialisé avec
  la notification : le test passe donc par `Notification::send()` sous `Queue::fake()`, pas par
  une notification construite à la main.
- `NotificationEnFileEchecTest` prenait `TaskDueReminderNotification` pour exemple du seul journal,
  construite sans constructeur et hors transaction : son `failed()` écrit désormais une activité (et
  lisait `$task` non initialisé). L'exemple passe à `BookingExpiredNotification`, qui garde
  `RetriesWithBackoff` seul ; le journal des cinq est asserté dans `EnvoisMarquesEnEchecTest`.
- Ablation : les cinq notifications remises à `9fa26e6ce` (`RetriesWithBackoff` seul) → 5 rouges
  (« No query results for model Activity ») ; correctif remis → 5 verts.
