---
id: TCK-836
title: "Gabarits PDF : taux de TVA et dates du relevé du bailleur au format français"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
  models:
    - "docs/models-spec.md#25-invoice-"
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-26--pdf--quittances-contrats-factures
tags: [back, pdf, invoices, owner-statement, pistes]
---

## Contexte

Réf : **P26.06** du fichier de pistes, `validé` (V7 accordé).

Deux écarts de format dans les actes : le taux de TVA de la facture passait par
`number_format(…, 2)` à l'anglaise (« TVA (18.5%) »), et le relevé du bailleur imprimait sa période
et les dates de ses reversements en ISO brut (« 2026-10-01 — 2026-10-31 »).

## Décision du porteur

validé — nombres et dates au format français ; reste : libellés des enums (après P06.03) et montant par échéance au contrat

## Reste à faire

libellés des enums (après P06.03) et montant par échéance au contrat

## Objectif utilisateur

Une facture et un relevé de gérance impriment leurs nombres et leurs dates comme on les lit au
Sénégal : virgule décimale, jour/mois/année.

## Contraintes strictes

- Les montants passent déjà par `@currency` (TCK-084) : non touchés.
- Un taux entier reste sans décimale (« TVA (18%) », lu par `CurrencyPdfRegressionTest`).

## Hypothèses (mode sans humain)

- **Dates** : `d/m/Y`, la forme que la facture emploie déjà pour « Émise le » et « Échéance ».
  Le relevé se traduit (TCK-672 le laisse dans la langue du lecteur) ; `d/m/Y` se lit aussi en
  anglais.
- La date d'un reversement se lit en UTC (fuseau de l'application), comme sa sous-chaîne ISO
  l'était.
- Le nom de fichier `facture-…` d'un avoir n'est ni un nombre ni une date : non touché.

## Delta à produire

- [x] `pdf/invoices/default.blade.php` : taux de TVA avec virgule décimale.
- [x] `pdf/statements/owner.blade.php` : période et dates de reversement en `d/m/Y`.
- [x] `tests/Feature/Services/GabaritsPdfFormatFrancaisTest.php`.

## Critères d'acceptation

- [x] AC1 — Taux de 18,5 % : « TVA (18,5%) », et « 18.5 » n'apparaît plus.
- [x] AC2 — Taux de 18 % : « TVA (18%) ».
- [x] AC3 — Relevé d'octobre 2026, un reversement du 2026-10-15 : « 01/10/2026 — 31/10/2026 » et
      « 15/10/2026 », aucune date ISO.

## Hors périmètre

- Libellés des enums imprimés, montant par échéance au contrat : reste du porteur.
- Le nom de fichier d'un avoir (`facture-…`).

## Notes d'implémentation

- **Ablation** : les deux gabarits rendus à `pre-dev`, AC1 et AC3 rougissent, AC2 reste vert
  (témoin). Remis : 3 verts ; `CurrencyPdfRegressionTest`, `ActesPdfEnFrancaisTest`,
  `InvoicePdfTest`, `InvoiceLegalMentionsTest`, `OwnerStatementTest`, `OwedRemainderTest` verts.
