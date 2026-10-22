---
id: TCK-1375
title: "Dialogue de facture : le taux de TVA affiché part tel quel, 0 % compris, pré-rempli par celui de l'agence"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-133--estimations-et-aperçus-calculés-au-front-face-au-calcul-de-lapi"
tags: [web, invoices, tva, pistes]
---

## Contexte

Réf : **P133.01** du fichier de pistes, `validé` par le porteur (critère accordé : V1).
`CreateInvoiceDialog` part avec `tax_rate: 0`, calcule son aperçu sur ce taux, puis envoie
`values.tax_rate || undefined` : le `0` ne part pas, et `InvoiceService::create` applique alors
`agencies.default_tax_rate`. Une agence à 18 % émet 118 000 quand l'écran annonçait 100 000.
L'aperçu arrondit aussi la TVA à l'unité (`Math.round`), l'API à l'unité de la devise.

## Décision du porteur

> validé — porteur (2026-10-22) : envoyer le taux de TVA affiché, 0 % compris

## Objectif

Le taux que la personne voit est celui que l'API applique, et l'aperçu de la TVA est celui que
l'API enregistre.

## Delta à produire

- [x] `tax_rate` envoyé tel quel (`?? 0`), jamais omis.
- [x] Le champ pré-rempli par `default_tax_rate` de l'agence de l'émetteur (`useAgencyInvoiceDefaults`,
      `GET /api/agencies/{id}`), tant que la personne n'y a pas touché ; 0 sans agence ou sans taux.
- [x] La TVA de l'aperçu arrondie par les décimales de `CURRENCY_METADATA`, comme `Currency::roundAmount`.

## Critères d'acceptation

- [x] AC1 — Un taux affiché à 0 part à 0 dans la charge utile.
- [x] AC2 — Pour une agence à 18 %, le champ montre 18, l'aperçu 18 000 de TVA sur 100 000, et 18 part.
- [x] AC3 — Remis à 0 par la personne, le taux part à 0 même pour une agence à 18 %.
- [x] AC4 — 10,50 € à 18 % : l'aperçu dit 1,89 €, pas 2,00 €.

## Hypothèse

La décision tranche l'envoi ; la `Piste` ajoute le pré-remplissage par le taux de l'agence, seule
option qu'elle décrit. Il est retenu : sans lui, toute facture créée depuis la console sans toucher
au champ passerait à 0 %, là où l'API appliquait jusqu'ici le taux de l'agence.

## Notes d'implémentation

- Ablation : `CreateInvoiceDialog.tsx` remis à `a2c7af2bc` → les 4 tests neufs rougissent
  (`tax_rate` absent de la charge, champ vide au lieu de 18, `2,00€` au lieu de `1,89€`) ; remis → verts.
- `onSuccess` remet le formulaire à zéro : l'aperçu se lit avant l'envoi dans les tests.
