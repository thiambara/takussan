---
id: TCK-1485
title: "Vider la surface d'un bien en édition l'efface au lieu d'être refusé"
status: todo
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
    - "docs/features.md#11-gestion-des-biens"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-149--champs-vidés-dun-patch-partiel-lus-comme-garder"
tags: [front, property-form, validation, pistes]
---

## Contexte

Réf : **P149.04** du fichier de pistes, `retenu · autonome` (A1).

`area` est un `z.coerce.number().positive().optional()` : `z.coerce` lit le `''` d'un champ
numérique vidé comme `0`, et le schéma refuse « la surface doit être positive ». Une surface saisie
ne peut plus être retirée depuis l'écran, alors que l'API accepte `null`. Le même schéma a déjà
`nombreFacultatif`, écrit pour ce cas ; P149.01 (TCK-1353) a laissé `area` « non traité » dans
l'effacement en édition.

## Objectif utilisateur

Le bailleur qui vide la surface d'un bien en édition l'efface.

## Contrat de données

`PATCH /api/properties/{id}` existant, qui accepte `area: null`.

## Contraintes strictes (métier)

- Bornes inchangées pour une surface saisie : entière, positive, au plus 1 000 000.
- Un champ jamais touché reste omis du corps d'édition.

## Delta à produire

- [ ] `area` passe par `nombreFacultatif` dans `propertyFormSchema`.
- [ ] `area` entre dans `CHAMPS_EFFACABLES`, et sort des « non traités » de
      `champs-effaces.tck-1353.test.ts`.
- [ ] Test : `area: ''` → absent ; vidé et modifié → `area: null` dans le corps ; `0` toujours
      refusé.

## Critères d'acceptation

- [ ] AC1 — `area: ''` passe le schéma, sans valeur.
- [ ] AC2 — vidée en édition, la surface part en `null`.
- [ ] AC3 — `0` et `12.5` restent refusés.

## Hors périmètre

- `rent_period`, `title_type` et `condition`, toujours « non traités » (reste de P149.01).

## Notes d'implémentation

_(à remplir par implementing-specs)_
