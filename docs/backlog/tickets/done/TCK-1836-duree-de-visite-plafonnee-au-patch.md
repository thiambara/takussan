---
id: TCK-1836
title: "Le PATCH d'une visite plafonne la durée comme la création"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-184--champs-hors-statut-que-le-patch-générique-écrit-alors-quun-geste-dédié-les-garde"
tags: [back, visites, validation, pistes]
---

## Contexte

Réf : **P184.03** du fichier de pistes, `retenu · autonome` (A1). La création d'une visite borne
`duration_minutes` à 240 minutes, avec sa raison écrite dans `StorePropertyVisitRequest` : une
visite de 100 000 minutes, une fois confirmée, bloquait le bien. `UpdatePropertyVisitRequest` ne
gardait que `min:5`, et le `PATCH` rouvrait le défaut par l'API directe.

## Objectif utilisateur

Une visite confirmée ne peut plus, par sa durée, rendre son bien inconfirmable pour toute autre
visite.

## Contrat de données

`PATCH /api/property-visits/{visit}` : `duration_minutes` au-delà de 240 → 422, erreur de
validation sur `duration_minutes`. Rien d'autre ne change.

## Delta à produire

- [x] `StorePropertyVisitRequest::MAX_DURATION_MINUTES = 240`, lue par la règle de création.
- [x] `UpdatePropertyVisitRequest` : `max:` de la même constante sur `duration_minutes`.
- [x] Test `PropertyVisitUpdateDureeTest`.

## Critères d'acceptation

- [x] AC1 — Le cas mesuré : `PATCH {duration_minutes: 100000}` sur une visite confirmée → 422, la
  durée reste à 30, et une autre visite du bien à J+20 se confirme.
- [x] AC2 — 240 reste accepté au `PATCH`.
- [x] AC3 — La règle de modification porte la constante de la création (241 refusé, 240 accepté).

## Hors périmètre

- Les autres règles de valeur de la création que la modification ne rejoue pas (angle 209).
- Les visites déjà enregistrées avec une durée au-delà de 240 : aucune réécriture de données.

## Notes d'implémentation

- Ablation : sans le `max:` de `UpdatePropertyVisitRequest`, AC1 et AC3 rougissent (le `PATCH`
  rend 200), AC2 reste vert ; correctif remis, 3 verts.
