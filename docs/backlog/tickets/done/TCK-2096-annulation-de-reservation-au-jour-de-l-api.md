---
id: TCK-2096
title: "« Annuler » une réservation confirmée se juge sur le jour UTC de l'API, pas sur celui du navigateur"
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
    - "docs/features.md#13-réservations-courte-durée--visites"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-212--dates-calendaires-et--aujourdhui--calculés-au-navigateur-face-au-jour-utc-de-lapi"
tags: [front, reservations, dates, pistes]
---

## Contexte

Réf : **P212.02** du fichier de pistes, `retenu · autonome` (A1 : la règle d'annulation est écrite
par l'API, TCK-1301 : `start_date <= now()->toDateString()`, fuseau UTC).

`BookingDetail.stayStarted` comparait `start_date` au jour LOCAL (`formatISODate(new Date())`).
À l'ouest d'UTC le soir, « Annuler » restait offert pendant que l'API répondait
`booking.cannot_cancel` ; à l'est, il disparaissait avant que l'API ne ferme l'annulation.

## Delta à produire

- [x] `stayStarted` compare `start_date` à `jourDeLApi()` (TCK-2094).
- [x] Tests : `BookingDetail.jour-de-l-api.new-york.p212-02.test.tsx` et
      `BookingDetail.jour-de-l-api.paris.p212-02.test.tsx` (un fuseau par fichier).

## Critères d'acceptation

- [x] AC1 — À 01:00 Z le 25 sous `America/New_York`, un séjour confirmé du 25 n'offre plus
      « Annuler ».
- [x] AC2 — À 22:30 Z le 24 sous `Europe/Paris`, un séjour confirmé du 25 offre encore « Annuler ».

## Hors périmètre

- Faire servir un `can_cancel` par l'API.

## Notes d'implémentation

- Le fuseau se fixe par `process.env.TZ` en tête de fichier, avant toute date : d'où deux fichiers.
- Ablation : `BookingDetail.tsx` rendu à `pre-dev` → 2/2 tests neufs rouges (bouton présent à New
  York, absent à Paris) ; correctif remis → 2/2 verts, et `BookingDetail.sejour-commence.tck-1301`
  (4), `.capabilities` (5), `.recu` (2), `.remboursement` (5) verts.
