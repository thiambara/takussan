---
id: TCK-1409
title: "Les filtres de plage `_min`/`_max` jugent la valeur selon le cast de la colonne"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#24-recherche--filtres"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-151--valeurs-de-filter-passées-brutes-à-une-colonne-typée"
tags: [back, filtres, pistes]
---

## Objectif utilisateur

Un `filter[price_min]=abc` rend une erreur de saisie (422) au lieu d'une erreur du serveur, et
une plage de visites « du 22 au 22 octobre » rend les visites de ce jour.

## Contexte

Réf : **P151.02** du fichier de pistes, `retenu · autonome` (A1 : le refus d'une valeur mal
formée est écrit pour les dates, `DateBoundaryFilter`, et la borne haute en date seule portée à
la fin du jour par `DayRange::after`).

Mesuré avant correctif (garde ci-dessous, rouge sur `e72d2ad69`) : `filter[<colonne>_min]=abc` →
`SQLSTATE[22P02]` sur la première colonne numérique rencontrée ; une visite le 2026-10-22 à 12 h,
`scheduled_at_min=scheduled_at_max=2026-10-22` → aucune ligne.

## Hypothèses (mode sans humain)

- Le type se lit au cast du modèle : `date`/`datetime` (et leurs variantes `immutable_`) → règle
  `['string','date']` ; tout autre, cast décimal ou absent (`area`) → règle `numeric`. Les onze
  colonnes relevées (`price`, `area`, `net_amount`, `gross_amount`, `total_amount`, `monthly_rent`,
  `amount`, `scheduled_at`, `posted_at`, `period_start`, `period_end`) tombent toutes juste.
- 422 par le validateur, sans code neuf, comme `DateBoundaryFilter`.
- La borne haute en date seule n'est étendue qu'aux horodatages (`datetime`) ; les colonnes `date`
  restent en `<=`.
- La page `/app/properties`, qui recopie `?price_min=` de son URL, n'est pas touchée : elle reçoit
  désormais un 422 au lieu d'un 500.

## Delta à produire

- [x] `RangeFilter::__invoke()` : règle selon le cast ; `_max` en date seule sur un `datetime` →
  `< DayRange::after()`.
- [x] Test : `tests/Feature/Api/FiltreDePlageTest.php` (chaque `$requestRangeFilters` de
  `app/Models` avec `abc`, une plage lisible, la borne haute en date seule).

## Critères d'acceptation

- [x] AC1 — Chaque filtre de plage déclaré refuse `abc` en 422, en `_min` comme en `_max`.
- [x] AC2 — `scheduled_at_min=scheduled_at_max=2026-10-22` rend la visite de 12 h ce jour-là.

## Notes d'implémentation

- Ablation : `RangeFilter.php` rendu à son état antérieur → 2 rouges ; remis → 3 verts.
