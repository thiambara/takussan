---
id: TCK-1002
title: "Le paiement enregistré par l'agence joint le locataire sans compte, et la bienvenue ne se tamponne que partie"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
    - "docs/features.md#15-transactions--paiements"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#le-locataire-sans-compte-napprend-ni-le-paiement-enregistré-par-lagence-ni-la-révision-de-loyer-ni-la-pénalité-ni-le-renouvellement-ni-la-restitution-de-caution"
tags: [back, notifications, payments, tenant, pistes]
---

## Contexte

Réf : **P48.02** du fichier de pistes, `validé` (critère V7 accordé).

`LeasePaymentService::markPaid` ne prévient le locataire que s'il a un compte, alors que le
paiement en ligne envoie au locataire sans compte le lien `/pay/{jeton}` de sa quittance
(TCK-602). La bienvenue du locataire pose `tenant_welcomed_at` même quand rien n'est parti.

## Décision du porteur

> ouvrir aux contacts sans compte (`reachesContacts`) les cinq messages : le paiement enregistré par l'agence (`lease_payment.recorded`, avec le lien `/pay/{jeton}` de la quittance, comme le paiement en ligne), la révision de loyer, la pénalité, le renouvellement et la restitution de caution ; ne poser `tenant_welcomed_at` que si le message est parti ; un test par code, locataire sans compte avec un téléphone valide (porteur, 2026-10-19)

## Reste à faire

> la révision de loyer, la pénalité, le renouvellement et la restitution de caution vers le locataire sans compte : ces quatre messages sont des classes `Notification` hors du catalogue `NotificationCode` (`LeaseRentReviewedNotification`, `LeasePaymentLateFeeNotification`, `LeaseRenewedNotification`, `LeaseDepositRefundNotification`), que `reachesContacts` ne gouverne pas ; les ouvrir demande de les porter au catalogue, avec leurs textes de cloche, d'e-mail et de SMS des deux côtés

## Objectif

Le locataire sans compte apprend, sur son téléphone, le paiement que l'agence a enregistré, avec
le lien de sa quittance ; la bienvenue ne se croit plus partie quand elle ne l'est pas.

## Hypothèses (mode sans humain)

- **Les quatre autres messages ne sont pas des codes.** La décision les nomme par
  `reachesContacts`, mais ils partent par quatre classes `Notification` à part, sans texte SMS
  ni place dans le catalogue que gardent `check-notification-codes.mjs` et
  `LangGroupParityTest`. Les y porter double le ticket (quatre codes, leurs textes API et front,
  leurs paramètres) : ils vont au reste, l'entrée le dit.
- **Un compte ne reçoit pas de SMS neuf.** Rendre le code `mobile()` est nécessaire pour qu'il
  parte en SMS vers un contact ; vers un compte, l'envoi passe `mobileBorne: false`, et ce que
  reçoit un compte ne change pas. L'interrupteur `lease_payment_received` était déjà mobile
  (`LeasePaymentSettledOnline`) : la matrice des préférences ne change pas.
- **Texte.** Les variantes `body_link` / `sms_link` de `lease_payment.recorded` suivent celles de
  `settled_online` ; en wolof, le texte français tel quel (wolof en pause).

## Delta à produire

- [x] `NotificationCode::LeasePaymentRecorded` : `reachesContacts()`, `mobile()`,
  `receipt_url` en paramètre facultatif et porteur.
- [x] `LeasePaymentService::markPaid` : sans compte et avec un téléphone valide, envoi au contact
  avec `receipt_url` (`LeasePaymentLinkService::urlFor`) ; avec compte, `mobileBorne: false`.
- [x] `lang/{fr,en,wo}/notifications.php` : `codes.lease_payment.recorded.{body_link,sms_link}`.
- [x] `SendTenantWelcomeNotification` : pas de tampon sans compte.
- [x] Tests : `LeasePaymentRecordedToContactTest`, `TenantWelcomeNotificationTest`.

## Critères d'acceptation

- [x] AC1 — un paiement enregistré pour un locataire sans compte, téléphone valide, part une fois
  vers son numéro (SMS), avec `receipt_url` = le lien `/pay/{jeton}` de l'échéance.
- [x] AC2 — un locataire avec compte le reçoit sur son compte, sans `receipt_url` ni canal mobile.
- [x] AC3 — sans compte ni téléphone ni e-mail, rien ne part.
- [x] AC4 — la bienvenue d'un bail dont le locataire n'a pas de compte ne pose pas
  `tenant_welcomed_at`.

## Hors périmètre

- Les quatre messages du reste.
- L'envoi de la bienvenue elle-même à un contact sans compte (la décision ne la nomme pas).

## Notes d'implémentation

- **Ablation** : `app/` et `lang/` remis à l'état d'origine → 2 rouges sur 8
  (`LeasePaymentRecordedToContactTest`, aucun envoi au contact ; `TenantWelcomeNotificationTest`,
  tampon posé) ; correctif remis → 8 verts.
- **Ablation du seul `mobileBorne: false`** → le test « compte » rougit (un SMS part vers le
  compte). Pour qu'il garde ce point, le compte y a un numéro vérifié et l'interrupteur SMS de
  `lease_payment_received` allumé : sans eux, le test était vert même sans la borne.
- Piège : `NotificationPreference` est semée à la création du compte ; le test l'allume par
  `updateOrCreate`, un `create` viole l'unicité.
