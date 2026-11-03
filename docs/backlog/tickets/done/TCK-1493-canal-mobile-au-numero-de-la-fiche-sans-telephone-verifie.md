---
id: TCK-1493
title: "Sans téléphone vérifié sur le compte, le canal mobile part au numéro de la fiche"
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
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-107--champs-de-contact-du-profil--lus-par-les-chemins-qui-envoient-ou-seulement-affichés"
tags: [back, notifications, sms, pistes]
---

## Contexte

Réf : **P107.01** du fichier de pistes, `validé` (critère V7 accordé).

Les relances de loyer, la quittance d'un paiement en ligne et les avis de visite choisissent le
compte dès qu'il existe, et ses canaux mobiles s'arrêtent sans `phone_verified_at`
(`SmsChannel.php:66-68`, `WhatsappChannel.php:87-89`). Un locataire ou un visiteur qui a un compte
au téléphone non vérifié perdait le SMS que le même numéro recevait sans compte.

## Décision du porteur

validé — porteur (2026-10-22) : sans téléphone vérifié sur le compte, le canal mobile part au contact de la fiche (`ContactSansCompte::fromCustomer` ou `fromVisit`), pour les seuls codes de `reachesContacts()`

## Contrat

- `ContactSansCompte::relaisMobileDuCompte(?User, ContactSansCompte $fiche): ?ContactSansCompte`
  rend la fiche réduite à son numéro quand le compte est joignable (ni bloqué ni supprimé), sans
  `phone_verified_at`, et que la fiche a un numéro valide ; `null` sinon.
- Le compte reçoit son envoi comme avant ; le relais reçoit le même code, **avec les paramètres du
  compte** : aucun lien porteur (`payment_url`, `receipt_url`), VERIF-602 M2 tient.
- Sites : relances J-3 et retard (`SendLeasePaymentReminders::notifyTenant`), quittance en ligne
  (`SendRentReceiptAfterOnlinePayment`), rappel de visite (`SendPropertyVisitReminders`),
  confirmation, déplacement et annulation de visite (`VisitNotifier::toVisitor`). Le SMS de visite
  relayé passe par la même borne (`borneLeSms`), et c'est son sort que l'action rend.

## Hypothèses (mode sans humain)

- **Le relais ne porte pas de lien porteur.** La décision ne dit rien du lien ; VERIF-602 M2
  (« un compte ne reçoit jamais le lien porteur ») est un choix écrit que la décision ne lève pas.
  Les gabarits `sms` sans `_link` existent pour chaque code.
- **`LeasePaymentRecorded` (paiement enregistré par l'agence) n'est pas relayé.** Il est dans
  `reachesContacts()`, mais TCK-1002 l'envoie au compte `mobileBorne: false` : le compte n'y a
  aucun canal mobile, même vérifié. Le relayer ferait recevoir un SMS au compte non vérifié et
  aucun au compte vérifié. Le relais remplace un canal mobile perdu, il n'en ouvre pas un neuf.
- Un compte bloqué ou supprimé ne déclenche pas de relais (`PrimaryPropertyContact::joignable`).

## Critères d'acceptation

- [x] AC1 — relance de retard, compte non vérifié : un envoi au compte et un envoi à la demande au
  numéro de la fiche, sans route `mail` ni `payment_url`.
- [x] AC2 — même cas, compte vérifié : aucun envoi à la demande.
- [x] AC3 — quittance en ligne, compte non vérifié : envoi au numéro de la fiche, sans `receipt_url`.
- [x] AC4 — rappel de visite et confirmation de visite d'un visiteur au compte non vérifié : envoi au
  `visitor_phone` ; un visiteur vérifié n'en reçoit aucun.

## Hors périmètre

- L'avis « joignable par e-mail seulement » à l'agence (seconde voie de la `Piste`, non retenue).
- Les chemins qui créent un compte sans vérifier son téléphone (« à vérifier » du constat).

## Notes d'implémentation

- Ablation : `relaisMobileDuCompte` rendant toujours `null` → 4 rouges sur 6 dans
  `RelaisMobileDuCompteTest` (les 2 témoins « vérifié » restent verts), remis → 6/6.
- `RentReceiptAfterOnlinePaymentTest::test_a_tenant_with_account_receives_it_on_the_account`
  affirmait « aucun envoi à la demande » pour un compte au téléphone non vérifié (défaut de la
  factory) : son locataire est désormais vérifié, l'intention du test (la quittance va au compte)
  inchangée.
