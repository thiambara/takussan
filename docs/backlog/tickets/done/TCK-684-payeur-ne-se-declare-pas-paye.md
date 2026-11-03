---
id: TCK-684
title: "POST /api/payments : le locataire et le client ne se déclarent plus payés"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-13--code-mort-et-doublons
tags: [back, payments, authorization, pistes]
---

## Contexte

Réf : **P13.05** du fichier de pistes, `validé` par le porteur (critère accordé : V1).

`POST /api/payments` (`PaymentController::store`) admet le locataire d'un bail et le client d'une
réservation (TCK-172), pour qu'ils puissent créer une échéance **en attente** avant un paiement
en ligne. Mais `status` et `paid_at` étaient transmis tels quels : un locataire postait
`status=paid` et recevait un 201 avec `data.status = paid`. Côté réservation, l'absence de statut
valait déjà `paid` (`BookingPaymentService::create`). La route contournait ainsi `markPaid` et
ses gardes (TCK-587). Aucun écran ne l'appelle.

## Décision du porteur

statut forcé à pending et paid_at refusé hors du personnel ; la route reste

## Objectif

Sur `POST /api/payments`, seul le personnel décide de l'état d'un paiement et de sa date. Le
payeur ne crée qu'une échéance `pending`.

## Delta à produire

- [x] `PaymentController::authorizeBookingManage` et `::authorizeLeaseManage` rendent `true` pour
      le personnel, `false` pour le seul payeur (403 inchangé pour tout autre).
- [x] Pour le payeur : `status` forcé à `pending`, sur le bail comme sur la réservation.
- [x] Pour le payeur : `paid_at` fourni → 422 sur `paid_at`, aucune ligne écrite.
- [x] Six cas neufs dans `tests/Feature/Api/PaymentRegistrationTest.php`.

## Critères d'acceptation

- [x] AC1 — un locataire qui poste `status=paid` obtient un 201 et une échéance `pending`, `paid_at` nul.
- [x] AC2 — un client qui poste sans statut, ou avec `status=paid`, obtient un paiement `pending`.
- [x] AC3 — un locataire ou un client qui envoie `paid_at` reçoit un 422 sur `paid_at`, et rien n'est écrit.
- [x] AC4 — le bailleur enregistre toujours un paiement `paid` avec `paid_at`.

## Hypothèses (mode sans humain)

- « Le personnel » est ce que les deux helpers admettaient déjà hors payeur : super-admin,
  bailleur du bail ou propriétaire du bien, personnel de l'agence (`staffAgencyId`). Un compte à
  la fois personnel et payeur reste traité en personnel.
- Le statut du payeur est **forcé** sans erreur (« forcé ») ; seul `paid_at` est **refusé** en 422
  (« refusé »), comme la décision les distingue.
- Le 422 est levé dans le contrôleur, après l'autorisation : le `FormRequest` ne connaît pas le
  rôle de l'appelant sur le payable. L'ordre 403 avant 422 est donc gardé.

## Hors périmètre

- Les effets en aval d'un paiement `paid` déjà créé ainsi (soldes, reçus, relevés) : non mesurés,
  aucune donnée n'est réécrite.
- `BookingPaymentService::create` garde son défaut `paid` pour le personnel.

## Notes d'implémentation

- Rouge avant correctif : 5 des 6 cas neufs (AC1-AC3) ; AC4 vert, comme attendu.
- Ablation : `PaymentController.php` remis à son état de `pre-dev` → 5 rouges sur 14 ; correctif
  remis → 14 verts.
- La garde `check-controller-authorization.mjs` refuse tout helper `authorize*` neuf : les deux
  helpers exemptés existants rendent donc le rôle, plutôt qu'un troisième helper.
