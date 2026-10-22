---
id: TCK-1346
title: "SMS reporté par les heures calmes : abandonné au matin si son lien ne sert plus"
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
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#48-invitation-"
    - "docs/models-spec.md#84-leasepaymentlink-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-132--liens-portés-par-les-sms-et-whatsapp--hôte-validité-page-ouverte"
tags: [api, sms, heures-calmes, invitations, pay-link, pistes]
---

## Contexte

Réf : **P132.04** du fichier de pistes, `validé`.

Entre 22 h et 6 h, le routeur SMS remet le texte déjà rendu à `SendDeferredSmsJob`, qui l'envoie
au matin sans relire l'objet. Une invitation révoquée ou relancée pendant la nuit, un lien de
paiement régénéré ou révoqué : le SMS de 6 h mène à un 410.

## Décision du porteur

« validé — porteur (2026-10-22) : commencer par les invitations : le job relit `revoked_at` et le jeton avant d'envoyer, et l'abandon s'écrit au journal ; puis les liens de paiement sur le même modèle »

Critère accordé : V7.

## Objectif

Un SMS reporté dont le lien ne sert plus n'est pas envoyé, et l'abandon est journalisé.

## Delta à produire

- [x] `DeferredSmsGuard` : la garde (type, identifiant, jeton **haché**) et son jugement —
      invitation : même ligne, même jeton, statut `sent` (donc ni révoquée ni acceptée), non
      expirée ; lien de paiement : `LeasePaymentLinkService::isLive`, les règles de `resolve()`.
- [x] `CodedNotification` porte la garde ; `NotificationService::send` la transmet pour un
      contact sans compte ; `SmsChannel` la pose dans le contexte (`deferred_guard`).
- [x] `SendDeferredSmsJob` la juge avant d'envoyer, et journalise l'abandon
      (`[sms.deferred] envoi abandonné …`).
- [x] Émetteurs : `InvitationService::deliver` (SMS d'invitation, de relance et de rappel), puis
      `markPaid`, `SendRentReceiptAfterOnlinePayment`, `SendLeasePaymentReminders`.
- [x] Tests : `InvitationBySmsTest` (révoquée, relancée, toujours valide),
      `LeasePaymentRecordedToContactTest` (lien régénéré).

## Critères d'acceptation

- [x] AC1 — SMS d'invitation reporté, invitation révoquée → aucun envoi au matin, une ligne de
      journal.
- [x] AC2 — Invitation relancée (jeton neuf) → le SMS reporté de l'ancien jeton ne part pas.
- [x] AC3 — Invitation toujours valide → le SMS part.
- [x] AC4 — Quittance d'un contact sans compte, lien régénéré → le SMS reporté ne part pas ;
      lien intact → il part.

## Hors périmètre

- Le repli SMS d'un WhatsApp en échec (`SendSmsAfterLateWhatsappFailureJob`) : il ne passe pas par
  le report de nuit décrit par la piste.
- Les SMS reportés déjà en file au déploiement n'ont pas de garde, et partent comme avant.

## Notes d'implémentation

- La garde ne porte que le jeton haché (sha256) : le contexte du job attend la nuit dans la table
  `jobs` (chiffré, TCK-678), mais un jeton en clair de plus n'y a rien à faire.
- Les tests rejouent le job avec le texte et le contexte que `SmsChannel` a remis au routeur
  (`FakeSmsRouter`), ce qui est exactement ce que `deferAll` met en file.
- Ablation : `SendDeferredSmsJob.php` remis à `HEAD` → 3 rouges (2 dans `InvitationBySmsTest`,
  1 dans `LeasePaymentRecordedToContactTest`) ; correctif remis → verts. `SmsChannelTest`,
  `SmsRouterDriverTest`, `SmsChainTimeBudgetTest`, `JobSmsChiffreTest`, `ContactSansCompteTest`,
  `SendLeasePaymentRemindersTest`, `RentReceiptAfterOnlinePaymentTest`, `InvitationSmsContentTest`,
  `InvitationLifecycleTest` verts.
