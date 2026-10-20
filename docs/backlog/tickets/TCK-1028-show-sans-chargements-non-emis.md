---
id: TCK-1028
title: "Retirer des `show` les relations chargées que leur ressource n'émet pas"
status: todo
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features: []
  models:
    - "docs/models-spec.md#5-booking"
    - "docs/models-spec.md#14-lease-"
    - "docs/models-spec.md#25-invoice-"
    - "docs/models-spec.md#40-bankstatement-"
    - "docs/models-spec.md#42-kycdossier-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-60--include-acceptés-chargés-et-non-émis--show-qui-ignorent-include-et-fields"
tags: [api, web, performance, eager-loading, pistes]
---

## Contexte

Réf : **P60.02** du fichier de pistes, `retenu · autonome` (A2). Cinq `show` chargent une relation
que leur ressource ne rend pas : `LeaseController::show` (`payments`), `InvoiceController::show`
(`customer`), `BookingController::show` (`agency`), `Admin\KycController::show` (`reviewer`), et
`BankStatementController::show`, qui accepte `include=agency` alors que `BankStatementResource`
n'émet que `agency_id`. Chaque lecture paie une requête pour rien — pour le bail, tous ses
paiements. Le front envoie de son côté `include: ['property', 'payments']` à la fiche de bail,
que ce `show` ignore.

## Objectif

Ces cinq `show` ne chargent plus que ce que leur ressource émet, sans que la réponse change.

## Delta à produire

- [ ] `LeaseController::show` : retirer `payments` du `load()`.
- [ ] `InvoiceController::show` : retirer `customer` du `load()`.
- [ ] `BookingController::show` : retirer `agency` du `load()` (`BookingMoneyAccess::canRefund`
      relit l'agence par `Agency::query()->find()`).
- [ ] `Admin\KycController::show` : retirer `reviewer` du `load()`.
- [ ] `BankStatementController::show` : retirer `agency` de la liste blanche de `include=`.
- [ ] `takussan-web/src/lib/queries/leases.ts` : retirer `payments` de l'`include` de `useLease`.
- [ ] Test : `tests/Feature/Api/ShowChargementsNonEmisTest.php`, qui relève les requêtes de
      chargement anticipé de chaque `show` et rougit si l'une de ces relations revient.

## Critères d'acceptation

- [ ] AC1 — `GET /api/leases/{id}` ne joue aucune requête `from "lease_payments" where
      "lease_payments"."lease_id" in`, et rend toujours `property`.
- [ ] AC2 — `GET /api/invoices/{id}`, `GET /api/bookings/{id}`, `GET /api/admin/kyc/{id}` et
      `GET /api/bank-statements/{id}?include=agency,uploadedBy` ne chargent plus `customers`,
      `agencies`, le relecteur (`users`) ni l'agence du relevé ; `uploaded_by` reste rendu.
- [ ] AC3 — Les clés rendues par ces `show` sont inchangées (aucune n'était émise).
- [ ] AC4 — Ablation : chaque relation remise rend le test rouge.

## Hypothèses (mode sans humain)

- Le chargement anticipé se reconnaît à sa forme SQL, `where "<table>"."<clé>" in (…)` : une
  lecture par `find()` (celle de `BookingMoneyAccess`) s'écrit `= ?`, et ne compte pas.
- `include=agency` sur un relevé reste accepté sans erreur, et simplement ignoré comme toute
  relation hors liste blanche : la réponse ne change pas.
- Le type `LeaseWithRelations.payments?` du front reste : aucun lecteur, mais le retirer sort du
  périmètre de la piste.

## Hors périmètre

- Faire honorer `include=`/`fields` par les `show` (P21.04, P60.03, au porteur).

## Notes d'implémentation

