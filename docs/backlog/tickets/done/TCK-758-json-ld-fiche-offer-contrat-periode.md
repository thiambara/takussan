---
id: TCK-758
title: "JSON-LD de la fiche : le prix dans une Offer, avec contrat et période"
status: done
phase: P2
family: front
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-9--pages-publiques--seo-et-partage"
tags: [front, seo, jsonld, pistes]
---

## Contexte

Réf : **P09.04** du fichier de pistes, `validé` (critère accordé : V7). `jsonLdRealEstateListing`
posait `priceSpecification` sur le `mainEntity` (`Apartment`, `House`, `Place`…), où schema.org ne
la définit pas, n'émettait ni contrat ni période (un loyer ressemblait à un prix de vente), et
posait `floorSize`, `numberOfBedrooms` et `yearBuilt` sur un `Place`.

⚠ TCK-335 et TCK-435 avaient refusé `Offer` délibérément (« jamais `Product`/`Offer` », balisage
trompeur au sens des règles Google), et un test le gardait. La décision du porteur ci-dessous
remplace ce refus pour `Offer` ; `Product` reste refusé, et le test le garde toujours.

## Décision du porteur

Offer avec businessFunction LeaseOut ou Sell, unitCode selon rent_period, champs hors domaine retirés de Place

## Objectif utilisateur

Un moteur lit dans la fiche si le bien est à vendre ou à louer, et pour quelle période.

## Contrat de données

Aucun endpoint : `contract_type` et `rent_period` sont déjà dans `PropertyDetail`.

## Contraintes strictes

- `price` reste décimal, jamais ×100 ; `priceCurrency` par défaut `XOF`.
- Jamais `Product`.

## Delta à produire

- [x] `RealEstateListing.offers` : `Offer { price, priceCurrency, businessFunction }`, plus une
  `UnitPriceSpecification` (`DAY`, `WEE`, `MON`, `ANN`) pour une location de période connue.
- [x] `priceSpecification` retirée du `mainEntity`.
- [x] Sur un `Place` : ni `floorSize`, ni `numberOfBedrooms`, ni `numberOfBathroomsTotal`, ni `yearBuilt`.

## Critères d'acceptation

- [x] AC1 — Vente : `businessFunction` `…#Sell`, sans prix unitaire.
- [x] AC2 — Location : `…#LeaseOut` et `unitCode` selon `rent_period`.
- [x] AC3 — Contrat ou période inconnus : la clé est omise, jamais devinée.
- [x] AC4 — Terrain, bureau, parking : aucun champ de logement.
- [x] AC5 — Aucun `Product` ; le `mainEntity` ne porte plus de prix.

## Hors périmètre

- Passer un validateur de données structurées (Rich Results Test) : sortie du poste.

## Notes d'implémentation

- `numberOfBathroomsTotal` est retiré du `Place` avec les trois champs cités : schema.org ne le
  définit, lui aussi, que sur `Accommodation`.
- Avant correctif : 7 rouges dans `jsonld-property.test.ts`. Ablation : fichier d'avant remis →
  8 rouges (7, plus l'assertion de `page.server.test.tsx` passée à `offers.price`) ; remis →
  22/22 ; `src/lib/__tests__/` et la fiche : 918/918.
