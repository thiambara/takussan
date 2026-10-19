---
id: TCK-979
title: "Un relevé bancaire importé avec un format vide ou nul le déduit de l'extension, plus de 500"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#40-bankstatement-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-54--règles-nullable-face-aux-colonnes-not-null"
tags: [api, accounting, reconciliation, validation, pistes]
---

## Contexte

Réf : **P54.04** du fichier de pistes, `retenu · autonome` (A1). `bank_statements.source_format`
est `NOT NULL` sans défaut. `StoreBankStatementRequest::prepareForValidation()` ne déduisait le
format de l'extension que si la clé était **absente** (`! has()`), et la règle était `nullable`.
Re-mesuré le 2026-10-19 sur `pre-dev` 1da537089 par le test de garde : `POST
/api/agencies/{id}/bank-statements` avec `source_format: null` ou `""` → **500** ; sans la clé → 202.

## Objectif

Un format vide ou nul se déduit de l'extension, comme un format absent ; le format est toujours
présent à l'écriture.

## Delta à produire

- [x] `prepareForValidation()` : déduction sous `! filled('source_format')`.
- [x] Règle `source_format` : `nullable` → `required` (la déduction a eu lieu avant).
- [x] `tests/Feature/Api/Accounting/BankStatementPipelineTest.php` : un cas par forme (clé absente,
      `null`, `""`), file faussée.

## Critères d'acceptation

- [x] AC1 — `source_format: null` ou `""` avec un `.csv` → 202, relevé en `csv`.
- [x] AC2 — Clé absente → 202, `csv` (inchangé).

## Hypothèses (mode sans humain)

- La déduction OFX n'est pas rejouée par le test : `UploadedFile::fake()` rend un `.ofx` en
  `application/octet-stream`, que la règle `mimes` refuse avant toute déduction (mesuré). La
  branche OFX de la déduction n'est pas modifiée.
- Aucun montant, ni le parseur, ni le rapprochement ne changent : seule la lecture du format
  d'entrée est touchée.

## Hors périmètre

- `StoreBankStatementRequest` étend `FormRequest` et non `BaseFormRequest` : signalé dans le rapport.

## Notes d'implémentation

- Avant correctif : 2 rouges sur 21 (deux 500). Ablation : la requête remise à sa version de
  `pre-dev` → 2 rouges ; correctif réappliqué → 21 verts. Voisins (`BankCsvMapping`,
  `BankReconciliation*`, `LargeBankStatementParse`, `AuthorizationPrecedesValidation`) : 83 verts.
