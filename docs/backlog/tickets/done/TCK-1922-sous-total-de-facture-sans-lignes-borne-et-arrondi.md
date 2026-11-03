---
id: TCK-1922
title: "Le sous-total d'une facture sans lignes est borné comme une ligne et arrondi à la devise"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#25-invoice-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-170--montants-envoyés-par-le-navigateur-et-pris-tels-quels-par-lapi"
tags: [api, invoices, pistes]
---

## Contexte

Réf : **P170.05** du fichier de pistes, `validé` (V1 accordé). Depuis TCK-1377, le sous-total d'une
facture à lignes est recompté et arrondi ligne à ligne ; sans `items`, `subtotal` était
`numeric|min:0` et le service le prenait tel quel : `10.5` en XOF émettait 10,5 XOF, et
`999999999999999` rendait 500 (`numeric field overflow`). Seul un appel direct passe par cette voie
(le front envoie des lignes).

## Décision du porteur

validation du porteur (2026-10-23) : sous-total sans lignes : `decimal:0,2`, `max:1000000000`, puis `Currency::roundAmount` ; 422 au-delà

## Delta à produire

- [x] `StoreInvoiceRequest` : `subtotal` `max:1000000000`, `decimal:0,2`.
- [x] `InvoiceService::create` : sans lignes, `Currency::roundAmount(subtotal, devise)`.
- [x] Test `InvoiceSubtotalWithoutLinesTest`.

## Critères d'acceptation

- [x] AC1 — XOF, `subtotal: 10.5` → 201, sous-total et total à 11.
- [x] AC2 — EUR, `subtotal: 1250.5` → 201, 1250,5.
- [x] AC3 — `999999999999999` et `1000000001` → 422 sur `subtotal` ; `1000000000` → 201.
- [x] AC4 — `10.555` → 422 sur `subtotal`.

## Hors périmètre

- Exiger des lignes (option écartée par la décision).

## Notes d'implémentation

- Ablation : FormRequest et service remis → 3 rouges sur 4 (10,5 rendu, 500, 201) ; remis → 4 verts.
- L'arrondi est `PHP_ROUND_HALF_UP` : 10,5 XOF devient 11.
