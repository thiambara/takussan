---
id: TCK-2230
title: "« Bloquer des dates » : la reprise au plus tôt le lendemain de la première nuit, les deux champs bornés à J+24 mois"
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
tags: [front, calendrier, dates, pistes]
---

## Contexte

Réf : **P230.02** du fichier de pistes, `retenu · autonome` (A1 : les bornes sont écrites par
`StorePropertyUnavailabilityRequest` : `ends_on` `after:starts_on` et
`before_or_equal:` `now()->addMonths(24)->toDateString()`, en UTC).

Le « Jour de reprise » de `PropertyCalendarPanel` avait pour `min` la première nuit elle-même, que
l'API refuse, et aucun des deux champs n'avait de `max`.

## Delta à produire

- [x] « Jour de reprise » : `min` au lendemain de la première nuit (à défaut, du jour), `max` au
      jour de l'API + 24 mois (`decalerAnnees(jourDeLApi(), 2)`).
- [x] « Première nuit » : `max` à la veille de cette borne, puisque la reprise doit lui être
      postérieure.
- [x] Test : `PropertyCalendarPanel.bornes.p230-02.test.tsx` (navigateur à New York, 01:00 Z).

## Critères d'acceptation

- [x] AC1 — Première nuit le 27 octobre → la reprise commence au 28.
- [x] AC2 — Le 25 octobre 2026 pour l'API : reprise ≤ 2028-10-25, première nuit ≤ 2028-10-24.

## Hors périmètre

- Le `min` de la première nuit reste le jour local : l'API ne borne pas `starts_on` sur le jour.
- Faire servir la borne de 24 mois par l'API : elle est recopiée de la règle, avec son renvoi.

## Notes d'implémentation

- Le `max` de la première nuit (veille de la borne) va un jour plus loin que la `Piste`, qui
  donnait la même borne aux deux champs : une première nuit le jour même de la borne ne laisse
  aucune reprise recevable.
- `decalerAnnees` et le `addMonths(24)` de Carbon tombent tous deux au 1er mars depuis un 29 février.
- Ablation : bornes retirées → 2/2 tests neufs rouges (`min` reçu le 27, `max` absent) ; remises →
  verts, avec `PropertyCalendarPanel.test.tsx` et `…tous-les-sejours.tck-1369.test.tsx` (10 tests).
