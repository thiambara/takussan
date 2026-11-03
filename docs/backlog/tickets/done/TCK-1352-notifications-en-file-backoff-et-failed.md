---
id: TCK-1352
title: "Notifications en file : délai entre essais, échec journalisé, et pas d'essai au-delà de la durée de vie d'un code"
status: done
phase: P2
family: technique
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
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-142--notifications-et-écouteurs-en-file-sans-backoff-ni-failed-hors-codednotification"
tags: [api, notifications, file, pistes]
---

## Contexte

Réf : **P142.05** du fichier de pistes, `validé`. Entre dans le lot de l'angle 132 par sa
famille : la piste cite `CodedNotification.php`, que le lot touche.

Sur les 28 notifications en file de `app/Notifications`, seule `CodedNotification` déclare
`backoff()` et `failed()` (TCK-800). Les 27 autres épuisent leurs trois essais en quelques
secondes et n'en laissent qu'une ligne de `failed_jobs`. Le code de suppression de compte vit
5 minutes : un délai long le livrerait périmé.

## Décision du porteur

« validé — porteur (2026-10-22) : un trait commun qui reprend `failed()` de `CodedNotification` et son délai `[60, 300, 900]`, et un `retryUntil()` égal à la durée de vie pour les codes et liens courts »

Critère accordé : V7.

## Objectif

Toute notification en file attend avant de réessayer, journalise son échec final, et un code ou
un lien court ne se réessaie pas au-delà de sa durée de vie.

## Delta à produire

- [x] Trait `App\Notifications\Concerns\RetriesWithBackoff` : `backoff()` `[60, 300, 900]`,
      `middleware()` qui retient le canal, `failed()` qui journalise la classe et le canal (sans
      le message de l'exception).
- [x] Les 27 notifications en file hors `CodedNotification` l'emploient.
- [x] `retryUntil()` égal à la durée de vie : `AccountDeletionStepUpCodeNotification`
      (`expiresInMinutes`), `ResetPasswordNotification` (`auth.passwords.*.expire`),
      `RegistrationConfirmationNotification` (`auth.verification.expire`).
- [x] Garde `tests/Unit/Architecture/NotificationsEnFileTest.php` ; test de comportement
      `NotificationEnFileEchecTest`.

## Critères d'acceptation

- [x] AC1 — Toute notification `ShouldQueue` de `app/Notifications` a `backoff()` et `failed()`.
- [x] AC2 — L'échec final se journalise avec la classe et le canal, sans le message de l'exception.
- [x] AC3 — Le code de suppression mis en file porte `retryUntil` = maintenant + 5 min.

## Hors périmètre

- `CodedNotification` garde ses propres `backoff()` et `failed()` (le sien journalise aussi le
  code et la ligne de cloche) : elle n'emploie pas le trait.
- Les écouteurs en file de l'angle 142 (autres entrées).
- L'activation du gérant (7 jours) n'a pas de `retryUntil()` : trois essais sur ~21 minutes
  restent loin de sa durée de vie.

## Notes d'implémentation

- Avec `retryUntil()`, le worker réessaie jusqu'à l'échéance sans compter `--tries` : le code de
  5 minutes a deux essais (0 et 60 s), le lien de 60 minutes en a six.
- Ablation : `app/Notifications` remis à `HEAD` (trait seul gardé) → 4 rouges (2 dans la garde,
  2 dans `NotificationEnFileEchecTest`) ; correctif remis → verts. Classes couvrant les
  notifications touchées vertes (activation, suppression, réinitialisation, cooptation,
  modération, relances, bienvenue du locataire, renouvellement).
