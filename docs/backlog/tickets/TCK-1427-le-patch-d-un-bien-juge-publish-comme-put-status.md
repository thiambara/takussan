---
id: TCK-1427
title: "Le PATCH d'un bien juge `properties.publish` comme PUT …/status"
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
    - "docs/features.md#11-gestion-des-biens"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-147--statuts-posés-par-un-ruleenum-entier-dans-les-requêtes-décriture"
tags: [back, biens, autorisation, pistes]
---

## Contexte

Réf : **P147.01** du fichier de pistes, `validé` par le porteur (critère V2 accordé).

`UpdateStatusPropertyRequest::authorize()` refuse `available` et `published` à qui n'a pas
`can('publish')` (TCK-587). `UpdatePropertyRequest` (`PATCH`/`PUT /api/properties/{id}`) ne
jugeait que `can('update')` : un agent dont le rôle retire `properties.publish`, ou un bailleur
sur sa proposition, remettait un bien au catalogue par le corps du `PATCH`.

## Décision du porteur

validé — porteur (2026-10-22) : le `PATCH` applique la règle de `PUT …/status` (un `status` affichable ou `visibility=public` demande `can('publish')`), et rejoint `cheminsDePublication`

## Contrat de données

- `PATCH /api/properties/{id}` avec `status` ∈ {`available`, `published`} ou `visibility=public`,
  sans `can('publish')` sur le bien → **403**, avant la validation, rien n'est écrit.
- Hypothèse : « un `status` affichable » se lit comme la règle de `PUT …/status` qu'il applique,
  soit la même liste (`UpdateStatusPropertyRequest::STATUTS_QUI_PUBLIENT`), partagée par les deux
  requêtes. `pending` n'en est pas, comme pour `PUT …/status`.
- Les autres champs, et les autres statuts, restent sous `can('update')`.

## Delta à produire

- [x] `UpdateStatusPropertyRequest::STATUTS_QUI_PUBLIENT`, lu par les deux requêtes.
- [x] `UpdatePropertyRequest::authorize()` juge `can('publish')` pour ces valeurs.
- [x] `PropertyAuthorizationTest` : deux cas `PATCH` dans `cheminsDePublication`, et le `PATCH`
  dans le test du bailleur.

## Critères d'acceptation

- [x] AC1 — agent sans `properties.publish` : `PATCH {status: available}` et
  `PATCH {visibility: public}` → 403, bien inchangé ; l'agent du rôle système → 200.
- [x] AC2 — bailleur, sa proposition : les deux mêmes `PATCH` → 403.

## Hors périmètre

- Le passage à `public` par le `PATCH` qui ne pose pas `published_at` : TCK-1429 (P147.03).
- Le formulaire d'édition du front n'envoie ni `status` ni `visibility` : aucun écran ne change.

## Notes d'implémentation

- Ablation : `authorize()` rendu à `can('update')` seul → 3 rouges (bailleur, et les deux cas
  `PATCH` du fournisseur : 200 et 422), remis → 18/18.
