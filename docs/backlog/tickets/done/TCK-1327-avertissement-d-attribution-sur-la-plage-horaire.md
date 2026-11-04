---
id: TCK-1327
title: "Attribution d'une intervention : l'avertissement « ne travaille pas » compare aussi l'heure à la plage du créneau"
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
  features:
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#37-serviceproviderprofile-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-117--clés-de-metadata-des-profils-écrites-par-les-assistants"
tags: [web, maintenance, prestataire, pistes]
---

## Contexte

Réf : **P117.07** du fichier de pistes, `validé` (V7 accordé).

`worksOn` (`MaintenanceAssignmentBlock`) ne comparait que le jour du créneau : `from` et `to` de
`metadata.availability`, validés par l'API (TCK-261), étaient ignorés. Une intervention un lundi à
18 h chez un prestataire disponible le lundi de 8 h à 12 h ne déclenchait rien.

## Décision du porteur

> porteur (2026-10-22) : comparer l'heure de l'intervention à la plage `from`–`to` dans `worksOn`, même avertissement et même texte

## Objectif

L'avertissement existant s'affiche quand l'heure choisie sort de la plage du créneau du jour.

## Delta à produire

- [x] `worksOn` : un créneau convient si le jour concorde et que l'heure (`HH:mm`, locale) est
      dans `[from, to]` ; une borne absente ne contraint pas.
- [x] Tests du bloc : lundi 18 h hors plage → avertissement ; lundi 10 h → aucun ; créneau sans
      heures → jour seul ; mardi → avertissement (contrôle du texte cherché).

## Critères d'acceptation

- [x] AC1 — Lundi 18 h, disponible le lundi 08:00–12:00 → « Ce prestataire ne déclare pas
      travailler ce jour-là. »
- [x] AC2 — Lundi 10 h, même prestataire → aucun avertissement.

## Hors périmètre

- Le téléphone d'un prestataire en brouillon, rendu ou non à l'agence (V3, à trancher avec P21.06).
- `documents.metadata.kind` et `.source` : laissés en l'état.

## Notes d'implémentation

- Piège : un premier motif de test (« ne travaille pas ») ne correspondait pas au texte rendu, et
  rendait le cas négatif vert à vide ; le motif est le texte exact, et un cas « mardi » le contrôle.
- Ablation : `worksOn` d'avant remis → le cas « lundi 18 h » rouge ; correctif → 6 verts.
