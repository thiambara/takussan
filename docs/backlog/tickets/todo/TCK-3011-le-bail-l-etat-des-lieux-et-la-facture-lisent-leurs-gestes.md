---
id: TCK-3011
title: "Le bail, l'état des lieux et la facture lisent leurs gestes sur l'API, policy et état compris (ADR-0139)"
status: todo
phase: P2
family: full
estimate: M
wave: 99
created: 2026-11-27
updated: 2026-11-27
depends_on: [TCK-3006]
blocks: []
spec_refs:
  features: ["docs/features.md#14-location-longue-durée-baux", "docs/features.md#19-état-des-lieux--inventaires"]
  models: []
tags: [back, front, baux, etat-des-lieux, factures, gestes, architecture, adr-0139]
---

## Objectif utilisateur

Sur la fiche d'un bail, d'un état des lieux ou d'une facture, chacun voit exactement les gestes que l'API lui permettra.

## Contrat de données

Relevé du 2026-11-27 (`dev` 4e3a929f7) :

- **Bail** : `LeaseResource::forViewer` (:48, :175-211) sert 13 `abilities` « policy seule » (« le statut du bail reste jugé par l'écran et l'API », :173-174), sauf `attach_guarantor`, `abandon`, `rent_review_force` ; `components/leases/fiche/gestes.ts` fait `a.x && lease.status …`. `LeaseController::show` pose `forViewer` ; les réponses des gestes (:94, 244, 258, 294) ne le posent pas.
- **État des lieux** : `InventoryDetail.tsx:84,128,140` fait `abilities.update && status`.
- **Facture** : `InvoiceDetailDialog.tsx:180` ne juge que `status === 'draft'`, sans `abilities` ni capacité.

## Contraintes strictes (métier)

- ADR-0139 : `abilities` = policy et état ; le front ne refait pas le statut pour décider ; pas d'`abilities`, pas de geste.
- Les réponses des gestes du bail rendent aussi `abilities` (la fiche se met à jour sans relecture).
- Les codes d'erreur et les règles des services (`LeaseService`, inventaire, facture) ne changent pas : on déplace le jugement d'état dans `abilities`, on n'invente pas de règle.

## Delta à produire

- [ ] `LeaseResource` : chaque clé d'`abilities` porte la précondition d'état que le service exige ; `LeaseController` pose `forViewer` sur les réponses des gestes
- [ ] `InventoryResource` et `InvoiceResource` : `abilities` (policy et état) pour leurs gestes
- [ ] Front : `components/leases/fiche/gestes.ts` cesse de tester le statut pour décider ; fonctions pures équivalentes pour l'état des lieux et la facture
- [ ] Tests API par ressource (chaque clé vraie et fausse selon l'état) ; tests front des fonctions pures

## Critères d'acceptation

- [ ] AC1 — `gestes.ts` du bail ne compare plus `lease.status` pour décider qu'un geste est permis (il peut le lire pour présenter).
- [ ] AC2 — Une facture non brouillon ne propose pas les gestes de brouillon, et l'API les refuse (test API + fonction pure).
- [ ] AC3 — Après un geste du bail, la réponse porte `abilities` à jour (test API).

## Hors périmètre

- Les listes (ADR-0139 § 5).

## Notes d'implémentation
