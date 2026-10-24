---
id: TCK-2094
title: "Le calendrier de la demande de visite n'offre que la fenêtre que l'API accepte : du jour UTC à J+60"
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-212--dates-calendaires-et--aujourdhui--calculés-au-navigateur-face-au-jour-utc-de-lapi"
tags: [front, visites, dates, pistes]
---

## Contexte

Réf : **P212.01** du fichier de pistes, `retenu · autonome` (A1 : la fenêtre est écrite par la
règle de l'API, `VisitSlotsPublicPropertyRequest` : `after_or_equal:today`,
`before_or_equal:+60 days`, en UTC).

Le calendrier de `PropertyVisitDialog` ne grisait que les jours d'avant minuit LOCAL, sans borne
haute. Un jour au-delà de J+60, ou la veille UTC le soir à l'ouest d'UTC, partait en
`GET …/visit-slots` et rendait « Les créneaux n'ont pas pu être chargés ».

## Delta à produire

- [x] `src/lib/jour-de-l-api.ts` : `jourDeLApi`, `decalerJour`, `decalerAnnees`,
      `jourEnDateLocale` — le jour que lisent les règles `today` de l'API, et ses décalages
      calendaires, sans composantes locales. Réutilisé par les autres pistes de l'angle 212.
- [x] Le calendrier borné à `[jour UTC, jour UTC + 60]`.
- [x] Tests : `PropertyVisitDialog.fenetre.p212-01.test.tsx` (navigateur à New York, 01:00 Z) et
      `jour-de-l-api.test.ts`.

## Critères d'acceptation

- [x] AC1 — À 01:00 Z le 25 octobre sous `America/New_York`, le 24 octobre (jour local) est
      grisé, le 25 offert.
- [x] AC2 — J+60 (24 décembre) est offert, J+61 grisé.

## Hors périmètre

- Distinguer dans `useCreneaux` un 422 (jour hors fenêtre) d'une panne : demande un texte neuf
  (V7), laissé de côté par le classement de la piste.
- Faire servir la fenêtre par l'API : la constante 60 est recopiée de la règle, avec son renvoi.

## Notes d'implémentation

- Le calendrier désigne un jour par ses composantes locales : la borne est le jour UTC
  (`jourDeLApi`) recomposé en minuit local (`jourEnDateLocale`), et non `new Date()` à minuit.
- Ablation : `PropertyVisitDialog.tsx` rendu à `pre-dev` → 2/2 tests neufs rouges (le 24 octobre
  et le 25 décembre `toBeDisabled` reçoivent un bouton actif) ; correctif remis → 2/2 verts, et
  `PropertyVisitDialog.test.tsx` (8) vert.
