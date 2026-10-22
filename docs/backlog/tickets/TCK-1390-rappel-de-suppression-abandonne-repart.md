---
id: TCK-1390
title: "Rappel J-7 de suppression du compte : un envoi abandonné repart, et la suppression est reportée d'autant"
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
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-142--notifications-et-écouteurs-en-file-sans-backoff-ni-failed-hors-codednotification"
tags: [api, notifications, file, rgpd, pistes]
---

## Contexte

Réf : **P142.03** du fichier de pistes, `validé`.

`account:execute-deletions` met le rappel J-7 en file puis pose `reminder_sent_at` aussitôt ;
`dueForReminder()` ne relit que `reminder_sent_at IS NULL`. Un envoi abandonné par le worker ne
repartait donc jamais, et la suppression s'exécutait à `scheduled_for` sans rappel (canal
e-mail seul, aucune cloche).

## Décision du porteur

« validé — porteur (2026-10-22) : `backoff` sur la notification et un `failed()` qui remet `reminder_sent_at` à nul : le rappel repart, et la suppression est reportée d'autant »

Critère accordé : V3.

## Hypothèses (mode sans humain)

- « Reportée d'autant » : `scheduled_for` avance du temps écoulé entre la marque
  (`reminder_sent_at`) et l'abandon de l'envoi, soit le retard pris par le rappel.
- Une demande déjà exécutée, absente ou sans marque n'est pas touchée.

## Objectif

Un rappel J-7 perdu repart au passage suivant, et le compte n'est pas supprimé plus tôt que le
délai que le rappel annonçait.

## Delta à produire

- [x] `backoff` : déjà porté par la notification depuis TCK-1352 (`RetriesWithBackoff`).
- [x] `AccountDeletionReminderNotification::failed()` : journalise (trait), remet
      `reminder_sent_at` à nul et reporte `scheduled_for` du retard.
- [x] Test `tests/Feature/Auth/RappelDeSuppressionEnEchecTest.php`, par le `failed()` du job en
      file (`SendQueuedNotifications`, après sérialisation).

## Critères d'acceptation

- [x] AC1 — Après l'abandon de l'envoi, `reminder_sent_at` est nul et la demande est de nouveau
      rendue par `dueForReminder()`.
- [x] AC2 — `scheduled_for` avance du temps écoulé depuis la marque.
- [x] AC3 — Une demande déjà exécutée n'est pas modifiée.

## Hors périmètre

- Les autres marques posées à la mise en file (P142.02, au porteur).

## Notes d'implémentation

- Le `failed()` du trait est repris sous un alias (`journaliserEchec`) : le journal de l'échec
  reste, et la garde `NotificationsEnFileTest` voit toujours `backoff()` et `failed()`.
- Ablation : la notification remise à `034d400b2` → 1 rouge (`reminder_sent_at` non nul) ;
  correctif remis → 2 verts.
