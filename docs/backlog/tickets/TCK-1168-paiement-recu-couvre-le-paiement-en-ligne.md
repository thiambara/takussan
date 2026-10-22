---
id: TCK-1168
title: "Le gabarit « Paiement reçu » s'applique aussi à la quittance d'un paiement en ligne"
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
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-98--écrans-décriture-de-la-console-super-admin--ce-quils-changent-hors-de-la-console"
tags: [back, notifications, templates, super-admin, pistes]
---

## Contexte

Réf : **P98.04** du fichier de pistes, `validé` (V7 accordé).

Décision du porteur : « validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket »

L'événement éditable `payment_received` n'était rattaché qu'à `LeasePaymentRecorded` (échéance
marquée payée par l'agence). La quittance d'un paiement en ligne part sous
`LeasePaymentSettledOnline`, sans événement de gabarit : réécrire « Paiement reçu » ne changeait
rien pour le locataire qui payait en ligne.

## Objectif utilisateur

Un gabarit « Paiement reçu » actif s'applique à tout paiement de loyer reçu, saisi par l'agence ou
réglé en ligne.

## Delta à produire

- [x] `NotificationCode::templateEvent()` : `LeasePaymentSettledOnline` → `payment_received`.
- [x] Test par code rattaché dans `NotificationTemplateOverrideTest`.

## Critères d'acceptation

- [x] AC1 — un gabarit `payment_received` actif remplace le sujet et le corps de l'e-mail
      `LeasePaymentRecorded` (test existant) et de l'e-mail `LeasePaymentSettledOnline` (neuf).

## Hors périmètre

- Renommer l'événement (l'autre voie de la piste).
- Le texte des gabarits déjà enregistrés : un gabarit actif rédigé pour la saisie par l'agence
  part désormais aussi aux locataires qui ont payé en ligne.

## Notes d'implémentation

- Choix : rattacher `LeasePaymentSettledOnline` à `payment_received`, la voie que recommande la
  ligne du délégué et la plus étroite (une ligne, aucun texte neuf) : les deux codes ont les mêmes
  paramètres (`amount`, `property`, `receipt_url`), la même préférence
  (`lease_payment_received`), et le titre du paiement en ligne est déjà « Paiement reçu ».
- Ablation : `NotificationCode.php` rendu à `pre-dev` → 1 rouge sur 3 (sujet « Paiement reçu :
  Villa Almadies », celui de la clé de langue) ; correctif remis → 3/3.
  `NotificationTemplateChannelsTest`, `NotificationTemplateTest`, `LeasePaymentRecordedToContactTest`,
  `WaveWebhookEventTableTest`, `RentReceiptAfterOnlinePaymentTest`, `BearerLinkAtRestTest` verts.
