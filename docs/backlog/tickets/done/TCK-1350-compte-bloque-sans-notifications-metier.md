---
id: TCK-1350
title: "Un compte bloqué ou supprimé ne reçoit plus que les notifications de son compte"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#1-user"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-88--comptes-blocked--ce-quils-reçoivent-et-qui-les-propose-encore"
tags: [api, notifications, comptes, pistes]
---

## Contexte

Réf : **P88.04** du fichier de pistes, `validé`. Entre dans le lot de l'angle 132 par sa famille :
la piste cite `NotificationService.php` et `CodedNotification.php`, que le lot touche.

Aucun chemin d'envoi ne lit `users.status` : un compte `blocked` reçoit cloche, e-mail et canal
mobile d'un code métier (mesuré par le mesureur sur `lease_payment.due_soon`), ses rappels de
tâche, ses alertes de recherche et de favoris.

## Décision du porteur

« validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket »

Critère accordé : V7.

## Choix de l'implémenteur

- « Non joignable » est la définition existante, `PrimaryPropertyContact::joignable()` :
  `blocked` ou `deleted`.
- La liste fermée des codes qui passent encore : `account.blocked`, `account.reactivated`, et
  `impersonation.ended` — la fin d'une consultation du compte par la plateforme, que le blocage
  clôt, et dont `ImpersonationLifecycleTest` exige l'avis au titulaire bloqué. Aucun code
  d'effacement n'existe parmi les codes : les e-mails d'effacement de compte sont des classes à
  part (`AccountDeletion*`), que ce ticket ne touche pas.
- Le silence vaut pour la cloche aussi : `NotificationService::send()` n'écrit aucune ligne et rend
  `null`, en journalisant le code.

## Objectif

Un compte bloqué ou supprimé ne reçoit que les codes de son compte.

## Delta à produire

- [x] `NotificationCode::reachesUnreachableAccount()` : la liste fermée.
- [x] `NotificationService::send()` et `CodedNotification::via()` : rien pour un compte non
      joignable hors de cette liste.
- [x] `SendTaskDueReminders`, `SendSavedSearchAlerts`, `SendFavoriteChangeAlerts` : `blocked` et
      `deleted` écartés de leurs requêtes.
- [x] Tests : `CompteNonJoignableTest` (neuf), `TaskReminderTest`, `SavedSearchAlertsTest`,
      `FavoriteChangeAlertsTest`.

## Critères d'acceptation

- [x] AC1 — Compte `blocked` ou `deleted`, `lease_payment.due_soon` → aucune ligne, aucun envoi,
      `via()` vide.
- [x] AC2 — Compte `blocked`, `account.blocked` → envoyé, `mail` compris.
- [x] AC3 — Rappel de tâche, alerte de recherche et alerte de favoris muets pour un compte bloqué.

## Hors périmètre

- `NotifyNewMessageJob` et les notifications envoyées directement par `$user->notify()` hors
  `CodedNotification` et hors des trois jobs : la piste ne les nomme pas (le premier est « à
  vérifier » dans le constat).

## Notes d'implémentation

- Ablation : les six fichiers de `app/` remis à `HEAD` → 4 rouges (un par classe de test) ;
  correctif remis → verts.
