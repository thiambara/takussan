---
id: TCK-2113
title: "Un garant neuf refusé par le plafond de trois ne laisse plus de fiche orpheline"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-213--écritures-faites-avant-un-refus-4xx-hors-de-la-transaction-qui-porte-le-refus"
tags: [api, baux, garants, transactions, pistes]
---

## Contexte

Réf : **P213.01** du fichier de pistes, `retenu · autonome` (A1 : le refus 422
`lease.max_guarantors` du plafond de trois garants est le contrat écrit, docblock de
`LeaseController::attachGuarantor` ; A5 pour la garde).

Sans `guarantor_id`, `attachGuarantor` créait la fiche `guarantors` avant et hors de la
`DB::transaction` qui juge le plafond : sur un bail à trois garants, la réponse était 422 et la
fiche restait en base, rattachée à aucun bail.

## Delta à produire

- [x] La fiche d'un garant neuf se crée dans la transaction, après les refus
  `lease.guarantor_already_attached` et `lease.max_guarantors`.
- [x] Test : `tests/Feature/Api/PlafondDesGarantsSansFicheOrphelineTest.php`.

## Critères d'acceptation

- [x] AC1 — Garant neuf posté sur un bail à trois garants : 422 `lease.max_guarantors`, et le
  compte de `guarantors` est inchangé.
- [x] AC2 — Garant neuf sous le plafond : créé (agence du bail, `added_by_id`), rattaché.
- [x] AC3 — Garant existant déjà rattaché : 422 `lease.guarantor_already_attached`, inchangé.

## Hors périmètre

- Les autres écritures avant un refus de l'angle 213 (P213.02 à P213.04), toutes à valider.

## Notes d'implémentation

- Hypothèse (mode sans humain) : le garant existant (`guarantor_id`) garde son `findOrFail` et son
  `authorize('view')` avant la transaction — ordre 404/403 inchangé.
- Ablation : correctif retiré (`LeaseController.php` rendu à `pre-dev`) → AC1 rouge, « Failed
  asserting that 4 is identical to 3 », les deux autres cas verts ; remis → 3/3 verts.
