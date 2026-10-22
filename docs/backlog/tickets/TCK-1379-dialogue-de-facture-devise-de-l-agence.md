---
id: TCK-1379
title: "Dialogue de facture : la devise est pré-remplie avec celle de l'agence, modifiable"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1375]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-133--estimations-et-aperçus-calculés-au-front-face-au-calcul-de-lapi"
tags: [web, invoices, currency, pistes]
---

## Contexte

Réf : **P133.03** du fichier de pistes, `validé` par le porteur (critère accordé : V1). P04.09
(TCK-738) fait replier l'API sur `agencies.currency` quand la devise manque, mais le dialogue part
avec `currency: 'XOF'` et l'envoie toujours : une agence en EUR qui ne touche pas au sélecteur
émet en XOF, aperçu compris.

## Décision du porteur

> validé — porteur (2026-10-22) : pré-remplir la devise avec celle de l'agence (P04.09), modifiable

## Objectif

Sans geste de la personne, la facture part dans la devise de l'agence de l'émetteur.

## Delta à produire

- [x] `useAgencyInvoiceDefaults` (TCK-1375) lit aussi `currency` de l'agence, `null` hors des quatre
      devises de facture.
- [x] Le dialogue pré-remplit le sélecteur avec elle tant que la personne n'y a pas touché ; XOF
      sans agence.

## Critères d'acceptation

- [x] AC1 — Agence en EUR : l'aperçu est en €, et `currency: 'EUR'` part sans toucher au sélecteur.
- [x] AC2 — Choisie en XOF par la personne, la devise part en XOF.

## Hors périmètre

- `CreateLeaseForm.tsx:81` écrit aussi `currency: 'XOF'` en dur, face à `LeaseService.php:94`
  (`?? 'XOF'`) : les deux côtés concordent, et la décision ne porte que sur le dialogue de facture.

## Notes d'implémentation

- Ablation : dialogue remis à l'état de TCK-1377 → AC1 rougit (`1500FCFA` au lieu de `1500,00€`) ;
  remis → vert. AC2 est vert dans les deux cas : il garde le « modifiable », pas le défaut.
