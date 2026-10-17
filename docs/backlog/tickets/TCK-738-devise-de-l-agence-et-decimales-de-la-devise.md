---
id: TCK-738
title: "Facture sans devise : celle de l'agence ; montants affichés avec les décimales de leur devise"
status: doing
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#28-internationalisation--préférences"
  models:
    - "docs/models-spec.md#25-invoice-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-4--argent--montants-devises-arrondis-factures-paiements"
tags: [back, front, invoices, currency, format, pistes]
---

## Contexte

Réf : **P04.09** du fichier de pistes, `validé` par le porteur (critères accordés : V1 et V7).

- `InvoiceService::create()` écrit `'currency' => $data['currency'] ?? 'XOF'` : une facture émise
  sans devise par une agence en EUR part en XOF.
- `fmt.montant` (`takussan-web/src/lib/format/useFormatteurs.ts`) impose 0 décimale à toute
  devise : 12,50 € s'affiche « 13 € ».

## Décision du porteur

devise par défaut d'une facture = celle de l'agence ; décimales de CURRENCY_METADATA à l'affichage

## Objectif utilisateur

Une agence qui ne facture pas en franc CFA voit ses factures émises dans sa devise, et ses montants
affichés au centime.

## Contrat de données

- Aucun endpoint neuf, aucune migration. `POST /api/invoices` : sans `currency`, la devise est
  `agencies.currency` de l'agence de l'émetteur ; sans agence (ou agence sans devise), `XOF`.
  Une `currency` explicite gagne toujours.
- Front : `fmt.montant(value, currency)` prend les décimales de `CURRENCY_METADATA[currency]`
  (`formatCurrency` de `@/lib/format/currency`), sauf option explicite de l'appelant.

## Contraintes strictes (métier)

- XOF et XAF restent sans décimale (principe non négociable n° 3).
- Un appelant qui ne passe que `maximumFractionDigits` ne doit jamais produire un minimum
  supérieur au maximum (`Intl.NumberFormat` lève une `RangeError`).
- **Hypothèse** : « l'agence » est celle de l'émetteur (`$user->agency_id`), déjà employée par
  `create()` pour le taux de TVA par défaut.
- **Hypothèse** : `RevenueChart` reste en XOF : il somme `plans.monthly_price_xof`
  (`PlatformReportingService.php:468`), une devise de plateforme et non d'agence.

## Delta à produire

- [ ] `InvoiceService::create()` : repli sur la devise de l'agence, puis XOF.
- [ ] `fmt.montant` : plus de 0 décimale imposée ; le minimum se borne au maximum demandé.
- [ ] `PayoutTable` (`useXof`) : plus de `maximumFractionDigits: 0` imposé.
- [ ] Tests : `InvoiceTest` (deux cas), `useFormatteurs.test.tsx` (trois cas).

## Critères d'acceptation

- [ ] AC1 — Agent d'une agence en EUR, facture sans `currency` : `data.currency` vaut `EUR`.
- [ ] AC2 — Même agence, `currency: XOF` explicite : `data.currency` vaut `XOF`.
- [ ] AC3 — `fmt.montant(12.5, 'EUR')` rend `12,50 €` en `fr` ; `fmt.montant(150000.4, 'XOF')`
      rend `150 000 F CFA`.
- [ ] AC4 — `fmt.montant(12.5, 'EUR', { maximumFractionDigits: 0 })` rend `13 €` sans lever.

## Hors périmètre

- Les autres replis `?? 'XOF'` de l'API (ressources, notifications, observateurs) : ils lisent la
  devise d'un objet déjà écrit, pas celle d'une écriture neuve.

## Notes d'implémentation

