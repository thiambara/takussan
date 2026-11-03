---
id: TCK-2102
title: "Les dates par défaut du renouvellement d'un bail se calculent en jours calendaires, sans fuseau"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-2094]
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-212--dates-calendaires-et--aujourdhui--calculés-au-navigateur-face-au-jour-utc-de-lapi"
tags: [front, baux, dates, pistes]
---

## Contexte

Réf : **P212.05** du fichier de pistes, `retenu · autonome` (A1 : le début attendu est écrit par
l'API, `LeaseRenewalService` : `parentEnd->addDay()`).

`defaultStartDate` et `defaultEndDate` de `LeaseRenewalDialog` lisaient la date à minuit UTC,
ajoutaient un jour (ou un an) en heure LOCALE, puis relisaient en UTC : aux changements d'heure
hors de Dakar, le début proposé égalait la fin du parent, ou la fin perdait un jour.

## Delta à produire

- [x] Les deux défauts par `decalerJour` et `decalerAnnees` (TCK-2094) ; sans fin de parent, le
      début reste le jour UTC (`jourDeLApi`), comme avant.
- [x] Test : `LeaseRenewalDialog.jours-calendaires.p212-05.test.tsx` (navigateur à Paris).

## Critères d'acceptation

- [x] AC1 — Fin du parent le 2026-03-29 → début 2026-03-30, fin 2027-03-30.
- [x] AC2 — Fin du parent le 2026-10-25 → début 2026-10-26, fin 2027-10-26.

## Hors périmètre

- Le service de renouvellement, les échéances et les montants : inchangés.
- Le jour en double côté échéances quand l'enfant commence le jour de la fin du parent
  (`lt($parentEnd)`), resté déduit par la mesure.

## Notes d'implémentation

- Ablation : `LeaseRenewalDialog.tsx` rendu à `pre-dev` → 2/2 tests neufs rouges ; correctif
  remis → 2/2 verts, et `LeaseRenewalDialog.test.tsx` (7) vert.
