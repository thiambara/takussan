---
id: TCK-2320
title: "Un reversement de la plateforme déjà versé dont une ligne est remboursée depuis est signalé, et le remboursement d'un loyer avertit le locataire et le bailleur"
status: done
phase: P1
family: applicatif
estimate: S
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: [TCK-1156, TCK-1214]
blocks: []
spec_refs:
  adr:
    - "docs/adr/0039-les-sorties-d-argent.md"
  features:
    - "docs/features.md#15-transactions--paiements"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-39--webhooks-de-paiement-refund-et-failed-sur-un-paiement-déjà-soldé"
tags: [api, web, paiements, remboursement, reversement-plateforme, notifications, pistes]
---

## Objectif utilisateur

Quand le fournisseur rembourse un paiement que la plateforme a déjà reversé à l'agence, le
super-admin le voit sur le reversement, et l'agence en est avisée. Quand c'est un loyer, le
locataire et le bailleur apprennent que la quittance déjà partie ne couvre plus la somme rendue.

## Contexte

Réf : **P39.07** du fichier de pistes. L'angle 76 a fermé le cas d'un reversement **pas encore
payé** (TCK-1156, TCK-1214 : `platform_payout.items_changed`). Restait le reversement `paid` :
la ligne remboursée y gardait son `platform_payout_id` et son montant, sans trace. Et la branche
`REFUNDED` d'`applyStatusToPayment` n'émettait aucun événement.

## Décision du porteur

> validation du porteur (2026-10-25) : un reversement de plateforme `paid` qui porte une ligne remboursée depuis est signalé à la console super-admin et notifié à l'agence, sans écrire de montant ; un événement de remboursement avertit le locataire et le bailleur ; reste : la compensation sur le prochain reversement de la plateforme, si un volume réel la justifie

## Reste à faire

- la compensation sur le prochain reversement de la plateforme, si un volume réel la justifie

## Hypothèses (prises sans humain, les plus conservatrices)

- **Le seul chemin est le webhook.** Le geste déclaré de l'agence refuse déjà un acompte soldé par
  la plateforme (`booking_payment.refund_settled_by_platform`, TCK-1160) : seul le remboursement
  du fournisseur touche une ligne d'un reversement de la plateforme.
- **Le signal se range dans `platform_payouts.metadata.refunded_since_paid`** (type, identifiant,
  référence, date), sans montant ni colonne neuve. La ressource le rend en `refunded_since_paid`.
  Une ligne n'y figure qu'une fois, même remboursée en plusieurs parts.
- **L'avis à l'agence ne porte pas de montant** non plus : le mois du reversement et la référence
  de la ligne. Destinataires : les admins actifs et l'admin principal, comme le double
  encaissement (TCK-593). Cible : `/app/agency/billing`, la page des reversements de la plateforme.
- **« Locataire et bailleur » vise le loyer.** L'événement `LeasePaymentRefunded` ne part que pour
  une échéance de bail, de la part neuve du remboursement (un événement rejoué n'en a pas). Le
  locataire est joint comme pour sa quittance : son compte (et le numéro de la fiche faute de
  téléphone vérifié, TCK-1493), sinon son téléphone. Un acompte de séjour remboursé n'avertit pas
  le voyageur : il n'a pas de quittance, et la décision parle du locataire et du bailleur.
- **Les trois codes sont non désactivables** (de l'argent rendu après coup), comme le double
  encaissement.

## Delta livré

- [x] `PlatformPayoutRefundSignal::record()`, appelé dans la transaction du remboursement par
      webhook, après la ligne de la pièce : sous verrou du reversement, seulement s'il est `paid`.
- [x] `PlatformPayoutResource::refunded_since_paid`, liste et détail de la console comme de
      `/api/me/payouts`.
- [x] Codes `platform_payout.refunded_since_paid`, `lease_payment.refunded` (mobile, contacts) et
      `lease_payment.refunded_landlord`, textes `fr`, `en`, `wo` (= `fr`) côté API et front.
- [x] Événements après validation : `PlatformPayoutLineRefunded` (avis à l'agence),
      `LeasePaymentRefunded` (avis au locataire et au bailleur).
- [x] Console : pastille « Remboursé depuis » dans la liste, et références dans le détail.
- [x] Cible neuve `agency_billing` (`/app/agency/billing`), déclarée dans
      `scripts/check-notification-target-audience.mjs` (la page exige `agency.update_billing`).

## Tests

- `tests/Feature/Api/Admin/PlatformPayoutRefundedSincePaidTest.php` (3) : loyer remboursé en entier
  après le versement → signalé (liste et détail), montants inchangés, avis à l'admin d'agence sans
  montant ; acompte remboursé en partie → une ligne signalée, un avis ; remboursement avant le
  versement → rien.
- `tests/Feature/Notifications/RentRefundNoticeTest.php` (2) : remboursement partiel → avis au
  locataire et au bailleur, de la part remboursée ; locataire sans compte → SMS au numéro de sa
  fiche, et un événement rejoué n'avertit personne une seconde fois.
- `takussan-web/src/components/billing/__tests__/rembourse-depuis-le-versement.tck-2320.test.tsx`
  (2) : la pastille et l'avis du détail.

## Notes d'implémentation

- **Ablation**, chacune rétablie → vert : `record()` retiré du webhook → 2 rouges ; garde `paid`
  retirée → 1 rouge ; envoi de l'avis d'agence retiré → 2 rouges ; `LeasePaymentRefunded` non
  émis → 2 rouges ; pastille et avis du front retirés → 2 rouges.
- `jsonb` réordonne les clés d'une entrée : `PlatformPayoutRefundSignal::of()` les rend dans un
  ordre fixe.
- Le SMS du locataire tient en deux segments à condition de rester court (`SmsSegmentsTest`) : la
  phrase sur la quittance n'est que dans le corps.
