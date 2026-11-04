---
id: TCK-2104
title: "Le préavis de résiliation et la validité d'un devis se bornent au jour UTC de l'API"
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
    - "docs/features.md#18-maintenance--interventions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-212--dates-calendaires-et--aujourdhui--calculés-au-navigateur-face-au-jour-utc-de-lapi"
tags: [front, baux, maintenance, dates, pistes]
---

## Contexte

Réf : **P212.06** du fichier de pistes, `retenu · autonome` (A1 et A5 : les bornes sont écrites par
l'API, `EarlyTerminationService` — `now()->startOfDay()->addDays($notice)` — et
`SubmitQuoteRequest` — `valid_until` `after_or_equal:today`).

- `todayPlusDays` (`EarlyTerminationDialog`) ajoutait les jours en heure locale puis relisait en
  UTC : un changement d'heure dans l'intervalle proposait un jour trop tôt, refusé
  (`notice_too_short`).
- Le champ « valable jusqu'au » de `QuoteSubmitForm` n'avait aucun `min`.

La fonction partagée « jour de l'API » que la piste demande est `src/lib/jour-de-l-api.ts`
(TCK-2094).

## Delta à produire

- [x] `todayPlusDays(n)` = `decalerJour(jourDeLApi(), n)`.
- [x] `min={jourDeLApi()}` sur l'échéance du devis.
- [x] Test : `bornes-au-jour-de-l-api.p212-06.test.tsx` (navigateur à Paris).

## Critères d'acceptation

- [x] AC1 — Le 2026-02-28 à 00:00 Z, préavis de 30 jours : date minimale et défaut 2026-03-30.
- [x] AC2 — À 22:30 Z le 24 octobre, l'échéance du devis a pour `min` 2026-10-24.

## Hors périmètre

- La garde (règle de lint ou script) qui refuserait `getDate()`/`setDate()` relus par
  `toISOString()` : laissée en reste.
- La migration des autres écritures d'« aujourd'hui » du front vers `jour-de-l-api.ts`.

## Notes d'implémentation

- Ablation, fichier par fichier : `EarlyTerminationDialog.tsx` rendu à `pre-dev` → test du préavis
  rouge (« expected '2026-03-29' to be '2026-03-30' ») ; `QuoteSubmitForm.tsx` rendu à `pre-dev` →
  test du devis rouge (`min` absent) ; correctif remis → 2/2 verts, et
  `EarlyTerminationDialog.test.tsx`, `QuoteSubmitForm.test.tsx`,
  `QuoteSubmitForm.apercu-arrondi.tck-1729.test.tsx` verts (17 au total avec le neuf).
