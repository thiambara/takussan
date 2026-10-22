---
id: TCK-1344
title: "Le lien de paiement porte la langue du SMS, et le compte né d'une invitation garde la sienne"
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
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#84-leasepaymentlink-"
    - "docs/models-spec.md#48-invitation-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-132--liens-portés-par-les-sms-et-whatsapp--hôte-validité-page-ouverte"
tags: [api, paiements, pay-link, invitations, i18n, pistes]
---

## Contexte

Réf : **P132.05** du fichier de pistes, `validé`.

Le lien `/pay/{jeton}` ne porte pas de langue : le proxy du front le redirige vers la langue du
cookie ou d'`Accept-Language`, et la page ne s'ouvre pas dans la langue du SMS. Le compte qui naît
d'une invitation n'écrit pas `preferred_language` et prend le défaut `fr`, quelle que soit la
langue de l'invitation.

## Décision du porteur

« validé — porteur (2026-10-22) : préfixer le lien de paiement par la langue du SMS (`/{locale}/pay/…`), et écrire `preferred_language` depuis `metadata.locale` de l'invitation à la création du compte »

Critère accordé : V7.

## Objectif

La page de paiement s'ouvre dans la langue du SMS qui porte son lien, et le compte né d'une
invitation garde la langue de celle-ci.

## Delta à produire

- [x] `LeasePaymentLinkService::urlFor` prend la langue du message (`/{locale}/pay/…` pour
      `fr`, `en`, `wo` ; sans langue, la forme d'avant).
- [x] Les trois émetteurs vers un contact sans compte la passent : `markPaid`,
      `SendRentReceiptAfterOnlinePayment`, `SendLeasePaymentReminders` (`$contact->locale`).
- [x] `InvitationService::acceptAsNewUser` écrit `preferred_language` par `preferredLocale`.
- [x] Tests : `LeasePaymentRecordedToContactTest`, `InvitationBySmsTest` ; attentes d'URL mises
      à jour dans `RentReceiptAfterOnlinePaymentTest` et `SendLeasePaymentRemindersTest`.

## Critères d'acceptation

- [x] AC1 — Locataire sans compte en `en` : le lien de quittance commence par `…/en/pay/`.
- [x] AC2 — Invitation dont `metadata.locale` vaut `en`, acceptée par un nouveau compte :
      `preferred_language` = `en`.

## Hors périmètre

- Le lien que l'agence copie depuis sa fiche (`LeasePaymentLinkController`) et l'URL de retour du
  fournisseur restent sans langue : aucun SMS ne les porte.

## Notes d'implémentation

- `send` écrit aujourd'hui `metadata.locale = fr` pour toute invitation (TCK-728) : le second
  point ne change le résultat que pour une invitation d'une autre langue.
- Ablation : préfixe retiré de `url()` et `InvitationService.php` remis à `HEAD` → 2 rouges dans
  `LeasePaymentRecordedToContactTest`, 1 dans `InvitationBySmsTest` ; correctif remis → verts.
  `RentReceiptAfterOnlinePaymentTest`, `SendLeasePaymentRemindersTest`, `PublicPaymentLinkTest`,
  `InvitationLocaleTest`, `InvitationLifecycleTest` verts.
