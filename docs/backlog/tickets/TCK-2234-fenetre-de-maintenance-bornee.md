---
id: TCK-2234
title: "La fenêtre de maintenance ne se programme plus sur un jour passé : `min` sur le début et la fin"
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
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-230--règles-de-date-relatives-au-jour-de-lapi-face-aux-bornes-des-champs-du-front"
tags: [front, super-admin, maintenance, dates, pistes]
---

## Contexte

Réf : **P230.04** du fichier de pistes, `validé (délégué)` (V7 accordé ; la borne est celle que
TCK-218 et `StoreMaintenanceRequest`, `starts_at` `after_or_equal:now`, écrivent déjà).

Les deux `DateTimePicker` de `maintenance.tsx` n'avaient pas de `min` : un instant passé n'était
refusé qu'à l'envoi.

## Décision du porteur (déléguée)

poser `min` sur les deux `DateTimePicker` de `maintenance.tsx` : l'instant présent (forme locale `YYYY-MM-DDTHH:mm` de la primitive) sur le début, le début choisi (à défaut l'instant présent) sur la fin ; l'API reste inchangée (`after_or_equal:now`, écrit par TCK-218) et aucun texte neuf ; garde : un test du formulaire à horloge figée où la veille est grisée dans les deux champs ; reste : dire « maintenant » (API qui tolère la minute courante, heure bornée dans la primitive, ou bouton « maintenant »)

## Reste à faire

dire « maintenant » (API qui tolère la minute courante, heure bornée dans la primitive, ou bouton « maintenant »)

## Delta à produire

- [x] Début : `min` = l'instant présent, forme locale `YYYY-MM-DDTHH:mm`.
- [x] Fin : `min` = le début choisi, à défaut l'instant présent.
- [x] Test : `MaintenanceScheduler.bornes.p230-04.test.tsx` (primitive réelle, horloge figée).

## Critères d'acceptation

- [x] AC1 — Le 25 octobre 2026, le 24 est grisé dans le début et dans la fin, le 25 offert.
- [x] AC2 — Début choisi le 28 → le 27 est grisé dans la fin, le 28 offert.

## Hors périmètre

- Le reste ci-dessus, gardé par le porteur. L'API ne change pas.

## Notes d'implémentation

- L'instant présent est pris au montage (`useState`) : la primitive ne grise que des jours, une
  page ouverte passé minuit garde la veille offerte, que l'API refuse à l'envoi comme avant.
- Le test monte la primitive réelle (le test existant la simule en `datetime-local`, sans `min`).
- Ablation : `min` retirés → 2/2 tests neufs rouges (la veille reste offerte) ; remis → verts, avec
  `MaintenanceScheduler.test.tsx` (4 tests).
