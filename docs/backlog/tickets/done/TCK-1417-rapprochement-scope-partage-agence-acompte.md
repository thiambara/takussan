---
id: TCK-1417
title: "Rapprochement : matcher et recherche par un scope partagé, l'agence d'un acompte lue par bookings.agency_id"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1415]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#41-bankstatementline-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-141--encaissements-soldés-par-la-plateforme-face-au-relevé-bancaire-de-lagence"
tags: [api, rapprochement, pistes]
---

## Contexte

Réf : **P141.04** du fichier de pistes, `validé`.

Le matcher et la recherche manuelle recopiaient chacun leurs filtres (non rapproché, agence, caution
rendue, facture encaissable, et depuis TCK-1415 encaissement de la plateforme), et
`scopeWhereNotReconciled` n'avait aucun appelant. L'agence d'un acompte se lisait par
`booking.property.agency_id` dans le matcher, la recherche et la garde de confirmation, mais par
`bookings.agency_id` dans la clôture de la plateforme et dans l'audit (`auditAgencyId`).

## Décision du porteur

« validé — porteur (2026-10-22) : matcher et recherche passent par un scope partagé ; l'agence d'un acompte se lit par une seule colonne, choisie après mesure »

Critère accordé : V1.

## Objectif

Un seul scope dit ce qui attend un crédit du relevé, et une seule colonne dit l'agence d'un acompte.

## Delta à produire

- [x] `scopeAwaitingBankCredit(int $agencyId)` sur `BookingPayment`, `LeasePayment`, `Invoice`, bâti
      sur `whereNotReconciled()` ; `ReconciliationMatcher::fetchCandidates()` et
      `PaymentSearchService` (acomptes, loyers, factures) l'appellent.
- [x] L'agence d'un acompte : `bookings.agency_id`, dans le scope et dans
      `ReconciliationManager::resolvePaymentAgencyId()`.
- [x] Tests : `PlatformSettledReconciliationTest` (réservation et bien d'agences différentes, dans les
      deux sens) ; fixtures de `PaymentSearchTest` et `BankReconciliationTest` qui posent
      `bookings.agency_id` comme le font les trois chemins de création.

## Critères d'acceptation

- [x] AC1 — Acompte d'une réservation de l'agence sur un bien d'une autre agence : suggéré, cherché,
      confirmable.
- [x] AC2 — Acompte d'une réservation d'une autre agence sur un bien de l'agence : ni suggéré, ni
      cherché, et 403 à la confirmation.

## Hors périmètre

- Les reversements (`Payout`), qui gardent leur `whereNull('bank_reconciled_at')` : hors de la `Piste`.

## Notes d'implémentation

- Choix de colonne, mesuré : les trois créations de `Booking` (`BookingService:126`,
  `PublicPropertyController:990,1024`) écrivent `agency_id = $property->agency_id`, et
  `UpdatePropertyRequest` n'accepte pas `agency_id` ; sur la base de développement (lecture seule),
  499 réservations, 0 dont l'agence diffère de celle du bien. `bookings.agency_id` est la colonne de
  l'argent (clôture plateforme) et de l'audit, et elle évite un `whereHas` imbriqué.
- Piège : `BookingFactory` laisse `agency_id` nul ; deux fixtures existantes l'omettaient et
  rougissaient (elles posent désormais la colonne, comme le code de création).
- Ablation : `app/` remis à l'état d'avant → 2 rouges (AC1, AC2) ; correctif remis → 7 verts.
