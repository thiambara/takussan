---
id: TCK-2706
title: "La relance fusionnée dit ce qu'elle annonce et son lien le règle : loyer et charges du même jour, nommés et payables"
status: todo
phase: P1
family: back
estimate: M
wave: 88
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2679]
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#15-leasepayment-"
tags: [back, payments, leases, relances, audit-ux, app]
---

## Objectif utilisateur

Un locataire **sans compte** reçoit par SMS une relance qui annonce « votre loyer de 650 000 F » (loyer
500 000 + charges 150 000, même date). Il ouvre le lien du SMS et paie. Aujourd'hui, il ne règle que
500 000 : les charges restent dues, et la relance suivante les lui annonce de nouveau sans qu'il
comprenne pourquoi. Il doit pouvoir payer, par ce lien, exactement ce que le message lui annonce.

Le texte ment aussi par son mot : « Votre loyer de 650 000 F » annonce sous le seul mot « loyer » un
montant qui comprend les charges. Le locataire et le bailleur doivent lire « loyer et charges », avec le
détail des deux montants.

## Contrat de données

**Relevé sur `feat/audit-ux-app-lot-1` le 2026-11-11**, après TCK-2679 (`1095f480d`) :

- `SendLeasePaymentReminders::claim()` rend des **groupes** d'échéances (même bail, même `due_date`) ;
  le message porte le solde **cumulé** du groupe (`remaining($dues)`), loyer en tête.
- `notifyTenant()` (`app/Jobs/SendLeasePaymentReminders.php`) ne reçoit que `$dues[0]`, le loyer. Pour
  un locataire sans compte, le lien porteur est
  `LeasePaymentLinkService::urlFor($payment)` : **un lien = une échéance** (`lease_payment_links`).
- Le paiement ouvert par ce lien (`PublicPaymentLinkController`, `PaymentGatewayService::amountDue`)
  encaisse le reste dû de **cette seule échéance**.
- Un locataire **avec compte** n'est pas touché par le lien : sa cloche mène au bail, et
  `GET /api/me/rent-summary` (TCK-2649) lui montre loyer et charges comme deux lignes payables chacune.
  **Il l'est par le texte**, comme le sans-compte et le bailleur.
- **Les textes** (`takussan-api/lang/{fr,en,wo}/notifications.php`, groupe `lease_payment`) :
  `due_soon` et `overdue` (`body`, `body_link`, `sms`, `sms_link`) disent « Votre loyer de :amount » /
  « loyer de :amount » ; `overdue_landlord` « Le loyer de :amount de :tenant ». Depuis TCK-2679,
  `:amount` est le solde **cumulé** du groupe : le mot « loyer » couvre aussi les charges. Le
  récapitulatif d'agent (`overdue_digest`, « :count loyers en retard ») compte des échéances, charges
  comprises.

**À servir** :

- un lien de relance dont le paiement couvre toutes les échéances du groupe annoncé, ou un SMS qui
  n'annonce que ce que son lien règle — le choix est à trancher (voir « Contraintes ») ;
- quand le groupe porte loyer **et** charges, des textes qui les nomment tous deux, avec le détail
  des montants (variantes de clé, ou paramètres `:rent` / `:charges` en plus de `:amount`) ; un groupe
  de loyer seul garde le texte d'aujourd'hui.

## Contraintes strictes (métier)

- **Le montant annoncé et le montant encaissé sont égaux.** Jamais un SMS qui annonce plus que ce que
  son lien permet de payer.
- **Le montant encaissé en ligne reste celui de TCK-593**, figé à l'ouverture du paiement, et une
  pénalité ne s'encaisse en ligne que si l'agence l'a choisi (`late_fee_online_collection`).
- **Le lien reste stable entre deux relances** (TCK-602, ADR-0051 §1) : le même lien à chaque relance
  d'un même groupe ; il ne doit pas en naître un par message.
- **Décidé par le porteur le 2026-11-11 : voie 2, un SMS par échéance payable (la recommandation ; pas d'ADR).** Deux voies étaient ouvertes (une ADR si la première est
  retenue : elle change ce qu'un lien désigne) :
  1. **un lien de groupe** — le lien porte plusieurs échéances, le paiement les règle dans un ordre fixé
     (loyer d'abord), un paiement partiel s'impute comme le reste de TCK-593 ;
  2. **un SMS par échéance payable** — le groupe reste un seul message pour le compte (cloche) mais le
     SMS du sans-compte annonce le loyer et donne son lien, puis les charges et le leur. Plus simple,
     mais deux liens dans un SMS.

## Delta à produire

- [ ] La voie retenue, dans `SendLeasePaymentReminders::notifyTenant()` et, pour la voie 1,
      `LeasePaymentLinkService` + le paiement par lien.
- [ ] Les textes de `lease_payment.due_soon`, `.overdue` et `.overdue_landlord` (corps, lien, SMS) dans
      les trois langues — **`wo` = le texte français tel quel** (wolof en pause depuis le 2026-10-16) —
      et les paramètres que le job leur passe.
- [ ] Tests :
  - `MergedReminderPayLinkTest` : bail à 500 000 + 150 000 de charges, sans compte, relance J+1 ; le
    paiement par le lien du SMS solde les deux échéances (voie 1) ou chaque lien solde la sienne et le
    SMS annonce les deux montants (voie 2) ;
  - le lien est le même à la relance J+7 ;
  - une échéance du groupe payée entre deux relances : le lien ne demande plus que le reste ;
  - `MergedReminderWordingTest` : groupe loyer + charges → texte « loyer et charges » avec les deux
    montants, au locataire (compte et sans compte) et au bailleur, en `fr`, `en` et `wo` ; groupe de
    loyer seul → texte inchangé, octet pour octet.

## Critères d'acceptation

- [ ] AC1 — Locataire sans compte, loyer 500 000 + charges 150 000 dus le même jour, rien payé : la somme
      que le SMS annonce égale ce que le ou les liens du SMS permettent de payer, au franc près.
- [ ] AC2 — Après un paiement par le lien du SMS de l'AC1, il ne reste rien de dû sur les deux
      échéances (voie 1), ou le reste est exactement l'échéance dont le lien n'a pas été suivi (voie 2).
- [ ] AC3 — Le même lien est envoyé à la relance suivante du même groupe.
- [ ] AC4 — Un locataire avec compte ne reçoit toujours aucun lien porteur.
- [ ] AC5 — Quand la relance fusionne loyer et charges, son texte les nomme (« loyer et charges ») et
      détaille les deux montants (500 000 et 150 000, total 650 000), pour le locataire et pour le
      bailleur, dans le corps et dans le SMS, en `fr`, `en` et `wo` (`wo` = le texte français). Une
      relance de loyer seul garde son texte d'aujourd'hui.

## Hors périmètre

- Les textes du front (aucun ne rend ces relances : elles sont rendues par l'API).
- Le récapitulatif d'agent (`overdue_digest`) : il compte des échéances, sans dire de quel type.
- Le paiement en ligne des pénalités contre le réglage de l'agence.
- La page « Paiements » du locataire avec compte (TCK-2650).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
