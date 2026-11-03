---
id: TCK-2175
title: "Créer un bien publié ou public exige properties.publish, comme le modifier"
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
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#22-rôles--permissions"
  models:
    - "docs/models-spec.md#3-property"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-209--requêtes-de-modification-qui-ne-rejouent-pas-les-règles-de-la-création"
tags: [api, biens, autorisation, capacites, pistes]
---

## Objectif

`POST /api/properties` refuse en 403 un `status` qui publie (`available`, `published`) ou
`visibility=public` à qui ne tient pas `properties.publish` dans l'agence visée, comme le `PATCH`
(TCK-1427) et les gestes dédiés (TCK-587).

## Contexte

Réf : **P209.01** du fichier de pistes, `validé` (V2 accordé).

`StorePropertyRequest::authorize()` ne jugeait que `can('create')` : un rôle personnalisé portant
`properties.create` sans `properties.publish` créait un bien `available` ou public, geste que le
même compte se voit refuser sur un brouillon par `PATCH`, `PUT …/status` et `PUT …/visibility`.

## Décision du porteur

validé — validation du porteur (2026-10-24) : 403 à la création quand `status` publie ou que `visibility` vaut `public` sans `properties.publish` dans l'agence visée, par une variante par agence de `PropertyPolicy::publish` lue par les deux `authorize()` ; le `POST` entre dans `cheminsDePublication`

## Hypothèses (mode sans humain)

- L'agence visée à la création est celle que `PropertyController::store` écrit : celle du profil
  actif (`$user->agency_id`) ; pour le super-admin, l'`agency_id` du corps (il passe de toute façon
  par `Gate::before`).
- Une proposition (bailleur sans `properties.create`) n'est pas jugée : le contrôleur la force en
  brouillon privé quel que soit le corps, et la refuser en 403 changerait un geste qui réussit.
- « Les deux `authorize()` » : la règle « c'est publier » est écrite une fois
  (`UpdateStatusPropertyRequest::publie()`) et lue par `StorePropertyRequest` et
  `UpdatePropertyRequest` ; `PropertyPolicy::publish` délègue à la variante par agence
  `publishAt` pour un bien d'agence.

## Delta à produire

- [x] `PropertyPolicy::publishAt(User, $agencyId)` : `properties.publish` et un profil dans
  l'agence ; `publish` y délègue pour un bien d'agence (un bien sans agence reste à son auteur).
- [x] `UpdateStatusPropertyRequest::publie()` : statut de `STATUTS_QUI_PUBLIENT` ou
  `visibility=public`, lu par les trois requêtes.
- [x] `StorePropertyRequest::authorize()` : `can('publishAt', [Property::class, $agence])` quand le
  corps publie, hors proposition.
- [x] `PropertyAuthorizationTest::cheminsDePublication` : la création, par statut et par
  visibilité.

## Critères d'acceptation

- [x] AC1 — agent d'un rôle sans `properties.publish`, rendu publiable : `POST /api/properties`
  `{status: available}` et `{visibility: public, accept_terms: true}` → 403, aucun bien créé.
- [x] AC2 — l'agent du rôle système, même corps → 201.
- [x] AC3 — les chemins de modification gardent leur refus (`cheminsDePublication`).

## Hors périmètre

- Les biens déjà créés publiés par un rôle sans `properties.publish` ne sont ni relevés ni
  dépubliés.

## Notes d'implémentation

- Avant correctif : les deux cas `POST` de `cheminsDePublication` rendent 201.
- Ablation : le jugement de `publishAt` court-circuité dans `StorePropertyRequest` → 2 rouges
  (201 au lieu de 403) ; remis → 20 verts.
- `$user->can('publishAt', [Property::class, $agence])` passe par la policy liée au modèle : la
  capacité est jugée sur l'`Agency` (2ᵉ argument de la Gate), et non sur le profil actif seul.
