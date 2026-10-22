---
id: TCK-1353
title: "Édition du bien : nombres « Non précisé », description et date de disponibilité vidés partent à `null`"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-149--champs-vidés-dun-patch-partiel-lus-comme--garder-"
tags: [web, biens, pistes]
---

## Contexte

Réf : **P149.01** du fichier de pistes, `retenu · autonome` (A1).

`withClearedFields` ne posait `null` que sur les cinq champs de TCK-598. Les nombres en liste
(« Non précisé » → `undefined`), `description` et `available_from` vidés sortaient du corps,
et l'API (`PropertyController.php:220`, `fill` des seules clés reçues) gardait l'ancienne valeur.
L'attendu est écrit dans le docblock de `withClearedFields` : un champ modifié et laissé vide part
à `null`, un champ jamais touché reste omis.

## Delta à produire

- [x] `CHAMPS_EFFACABLES` = TCK-598 + `bedrooms`, `bathrooms`, `year_built`, `floor_number`,
      `parking_spaces`, `total_floors`, `description`, `available_from` ; lu par `withClearedFields`.
- [x] Garde : chaque champ facultatif de `propertyFormSchema` est classé (effaçable, adresse,
      valeur par défaut, non traité) ; un champ neuf la fait rougir.

## Critères d'acceptation

- [x] AC1 — Chacun des huit champs vidé et modifié → `null` dans le JSON envoyé.
- [x] AC2 — Jamais touché → omis ; une valeur saisie part telle quelle.

## Reste à faire

> juger l'effacement en édition de `rent_period`, `title_type`, `condition` et `area` (P149.04), classés « non traités » par `champs-effaces.tck-1353.test.ts`

## Hypothèses

- `UpdatePropertyRequest` accepte `null` sur les huit colonnes (`sometimes|nullable`, lu
  l. 48-70) : aucun changement côté API.

## Notes d'implémentation

- Ablation : la boucle remise sur `CHAMPS_EFFACABLES_TCK598` → 7 rouges (`total_floors` partait déjà
  à `null` par la matrice dans ce contexte) ; remis → 18 verts, 376 dans `property-form/__tests__`.
