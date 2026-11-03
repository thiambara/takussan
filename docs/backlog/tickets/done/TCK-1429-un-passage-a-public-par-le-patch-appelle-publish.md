---
id: TCK-1429
title: "Un passage à `public` par le PATCH d'un bien appelle `publish()`"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1427]
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-147--statuts-posés-par-un-ruleenum-entier-dans-les-requêtes-décriture"
tags: [back, biens, publication, pistes]
---

## Contexte

Réf : **P147.03** du fichier de pistes, `validé` par le porteur (critère V2 accordé).

`publish` refuse un bien `sold` ou `rented` (422 `property.cannot_publish`) et pose `status`,
`visibility` et `published_at`. Le `PATCH /api/properties/{id}` écrivait `visibility=public` seul :
un bien vendu devenait public, et un brouillon passait « public » sans `published_at`, donc hors du
catalogue (`scopePublic` exige `published_at`) tout en s'affichant public à la console.

## Décision du porteur

validé — porteur (2026-10-22) : un passage à `public` par le `PATCH` appelle `publish()`, comme `updateVisibility`

## Contrat de données

- `PATCH /api/properties/{id}` dont `visibility=public` fait passer à `public` un bien qui ne l'est
  pas : les autres champs s'écrivent, puis `publish()` s'applique, **dans la même transaction**.
  Un refus de `publish()` (422 `property.cannot_publish`, `quota.listings_exceeded`,
  `property.publish_contact_incomplete`) annule le `PATCH` entier.
- Hypothèse : `publish()` pose `status=available`, comme par `PUT …/visibility` ; un `status`
  envoyé dans le même corps est donc écrit puis remplacé (et un `status=sold` fait refuser).
- Renvoyer `visibility=public` sur un bien déjà public ne republie pas (`published_at` gardé).
- Le droit (`properties.publish`) est jugé avant, par TCK-1427.

## Delta à produire

- [x] `PropertyController::update` : passage à `public` → `publish()` dans la transaction.
- [x] `tests/Feature/Api/Property/PropertyPatchVersPublicTest.php`.

## Critères d'acceptation

- [x] AC1 — bien `sold` privé : `PATCH {visibility: public, title}` → 422 `property.cannot_publish`,
  bien privé, titre inchangé.
- [x] AC2 — brouillon privé : `PATCH {visibility: public}` → 200, `available`, `published_at` posé,
  bien dans `Property::public()`.
- [x] AC3 — brouillon du bailleur : `PATCH {status: available, visibility: public}` → 403.
- [x] AC4 — bien déjà public : `published_at` inchangé.

## Hors périmètre

- Le formulaire d'édition du front n'envoie pas `visibility` : aucun écran ne change.

## Notes d'implémentation

- Ablation : contrôleur remis à l'origine → 2 rouges (AC1 : 200 ; AC2 : `draft`), remis → 4/4.
- AC3 et AC4 sont verts sans ce correctif : AC3 par TCK-1427, AC4 parce que l'ancien code ne
  touchait pas `published_at` non plus. Ils gardent ce que le correctif ne doit pas casser.
