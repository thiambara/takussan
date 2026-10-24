---
id: TCK-2228
title: "« Proposer un autre créneau » n'offre que la fenêtre que l'API accepte : du jour UTC à J+60"
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
    - "docs/features.md#13-réservations-courte-durée--visites"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-230--règles-de-date-relatives-au-jour-de-lapi-face-aux-bornes-des-champs-du-front"
tags: [front, visites, dates, pistes]
---

## Contexte

Réf : **P230.01** du fichier de pistes, `retenu · autonome` (A1 : la fenêtre est écrite par la
règle de l'API, `VisitSlotsPublicPropertyRequest` : `after_or_equal:today`,
`before_or_equal:+60 days`, en UTC, et déjà appliquée par l'autre appelant de `useCreneaux`,
TCK-2094).

Le champ du jour de « Proposer un autre créneau » (`VisitDetail.tsx`, `ProposerUnCreneau`) n'avait
ni `min` ni `max`. Un jour passé ou au-delà de J+60 partait en `GET …/visit-slots`, refusé, et
rendait « L'action n'a pas abouti. ».

## Delta à produire

- [x] Le champ du jour borné à `[jourDeLApi(), jourDeLApi() + 60]`.
- [x] La constante `JOURS_DE_VISITE_OUVERTS` partagée par les deux appelants de `useCreneaux`
      (`useCreneaux.ts`), au lieu d'une copie dans `PropertyVisitDialog`.
- [x] Test : `VisitDetail.proposer-fenetre.p230-01.test.tsx` (navigateur à New York, 01:00 Z).

## Critères d'acceptation

- [x] AC1 — À 01:00 Z le 25 octobre 2026 sous `America/New_York`, le champ porte
      `min="2026-10-25"` (jour UTC, non le 24 local) et `max="2026-12-24"`.

## Hors périmètre

- Distinguer dans `useCreneaux` un 422 (jour hors fenêtre) d'une panne : texte neuf (V7).
- Faire servir la fenêtre par l'API : la constante 60 reste recopiée de la règle, avec son renvoi.

## Notes d'implémentation

- Le premier jour est figé au montage (`useState(() => jourDeLApi())`) : un dialogue ouvert à
  cheval sur minuit UTC garde sa fenêtre, comme `PropertyVisitDialog` (`useMemo([])`).
- Ablation : `min`/`max` retirés de `VisitDetail.tsx` → le test neuf rouge (`min` reçu `null`) ;
  remis → vert, ainsi que `VisitDetail.tck-590.test.tsx` et les deux tests de `PropertyVisitDialog`
  (18 tests).
- Piège : jsdom applique `min`/`max` à la soumission. `VisitDetail.tck-590.test.tsx` saisit le
  12 novembre 2026 sous l'horloge réelle : avec le `min` neuf, il rougit dès le 13 (mesuré,
  horloge posée au 20 novembre → 1 rouge). Son horloge est figée au 24 octobre (`toFake: ['Date']`).
