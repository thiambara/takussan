---
id: TCK-747
title: "E-mails du compte en file urgente : un SMTP en panne ne fait plus échouer l'inscription"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: [TCK-746]
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#23-notifications"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-11--notifications--doublons-préférences-échecs"
tags: [back, auth, notifications, queue, pistes]
---

## Contexte

Réf : **P11.04** du fichier de pistes, `validé` par le porteur (critère accordé : V2).

`AuthController::register` crée le compte hors transaction, puis `Registered` envoie
`RegistrationConfirmationNotification` dans la requête. Transport d'e-mail injoignable → 500, le
compte existe déjà, aucun jeton n'est rendu, et la nouvelle tentative bute sur « e-mail déjà
pris ». Même envoi synchrone pour `ResetPasswordNotification` et les `AccountDeletion*`.

## Décision du porteur

ShouldQueue sur l'inscription, la réinitialisation et les AccountDeletion*, file notifications-urgent

## Objectif utilisateur

Une panne du transport d'e-mail ne casse ni l'inscription ni la demande de réinitialisation : le
compte est créé et connecté, l'e-mail part dès que le transport revient (retentes de la file).

## Contraintes strictes

- File `notifications-urgent` (consommée en tête par le worker), par `viaQueues()`.
- Une notification qui porte un secret (jeton de réinitialisation, code de step-up) est
  `ShouldBeEncrypted` : la table `jobs` ne le porte pas en clair (même règle que TCK-602 pour les
  liens porteurs).
- **Hypothèse** : `AccountDeletionExecutedNotification` reste synchrone. Elle est envoyée juste
  avant l'anonymisation, dans la transaction de `executeDeletion()` ; en file, le worker relirait
  la ligne `users` déjà anonymisée (`SerializesModels`) et l'e-mail partirait vers l'adresse
  effacée. La mettre en file demanderait de ranger l'adresse d'origine dans la charge du job après
  l'effacement : une décision de données personnelles (V3), laissée au porteur.

## Delta à produire

- [x] `ShouldQueue` + `viaQueues()` sur `RegistrationConfirmationNotification`,
      `ResetPasswordNotification`, `AccountDeletionRequestedNotification`,
      `AccountDeletionReminderNotification`, `AccountDeletionStepUpCodeNotification`.
- [x] `ShouldBeEncrypted` sur `ResetPasswordNotification` et `AccountDeletionStepUpCodeNotification`.
- [x] `tests/Feature/Notifications/NotificationsDeCompteEnFileTest.php`.

## Critères d'acceptation

- [x] AC1 — `POST /api/auth/register` avec un SMTP injoignable rend un succès et un jeton ; la
      confirmation est en file `notifications-urgent`.
- [x] AC2 — `POST /api/auth/forgot-password` avec un SMTP injoignable rend 200 ; le jeton n'est pas
      en clair dans la charge du job.
- [x] AC3 — Les cinq notifications sont `ShouldQueue` sur `notifications-urgent`.

## Reste à faire

- `AccountDeletionExecutedNotification` en file, avec l'adresse d'origine dans la charge (V3).

## Hors périmètre

- Les autres notifications du dépôt ne sont pas touchées.

## Notes d'implémentation

- **Ablation** : les cinq notifications rendues à leur état d'avant → 3 rouges sur 4 (500
  `TransportException` à l'inscription et à la demande de réinitialisation ; propriété de file) ;
  correctif remis → 4 verts.
- `VerifyEmail` et `ResetPassword` du framework n'utilisent pas `Queueable` : les sous-classes
  l'ajoutent.
- La commande chiffrée se relit par `unserialize(decrypt($commande))` : Laravel chiffre la commande
  déjà sérialisée.
- Une demande de suppression est mise en file dans une transaction : avec TCK-746, elle n'entre
  dans la file qu'au commit.
