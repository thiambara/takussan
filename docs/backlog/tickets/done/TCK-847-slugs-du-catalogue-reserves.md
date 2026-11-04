---
id: TCK-847
title: "Les slugs du catalogue d'équipements sont réservés : une proposition ne prend plus `forage`"
status: done
phase: P2
family: back
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#10-tag"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#un-équipement-ajouté-au-catalogue-prend-slug-2-quand-une-proposition-détient-déjà-son-slug-et-ne-se-traduit-jamais"
tags: [back, tags, i18n, pistes]
---

## Contexte

Réf : **P30.03** du fichier de pistes, `validé` par le porteur (critère accordé : V4).

Deux noms distincts pour l'index `tags_name_lower_unique` peuvent avoir le même slug (« Forage ! »
et « Forage »). Une proposition créée avant que le catalogue n'ajoute ce nom prenait `forage`, et
`synchroniser()` donnait `forage-2` à l'équipement du catalogue : le front, qui traduit par slug
(`amenityCatalog.<slug>`), ne le traduisait plus.

## Décision du porteur

réserver les slugs du catalogue : suffixe d'office pour une proposition, et synchroniser() reprend le slug exact à une proposition non approuvée qui le détient

## Objectif utilisateur

Un équipement du catalogue s'affiche toujours traduit, quel que soit l'ordre dans lequel les
propositions et le catalogue sont arrivés.

## Contrat de données

- `TagCatalog::slugLibre($nom, horsCatalogue: true)` : le slug d'une proposition. Si le slug de
  base est celui d'un nom du catalogue (équipements et étiquettes CRM) et que le nom n'est pas
  ce nom-là (casse repliée), le premier essai est `<slug>-2`.
- `TagCatalog::synchroniser()` : à la création d'un nom du catalogue, une ligne **non approuvée**
  (en attente ou refusée) qui détient le slug exact reçoit un slug suffixé, et le catalogue prend
  le slug exact. Une ligne approuvée garde le sien (le catalogue retombe alors sur `<slug>-2`,
  comme avant).

## Delta à produire

- [x] `TagCatalog::slugLibre()` : paramètre `horsCatalogue`.
- [x] `TagProposals::proposer()` : `horsCatalogue: true`.
- [x] `TagCatalog::assurer()` : reprise du slug exact à un détenteur non approuvé.
- [x] Test : `TagCatalogSlugReserveTest` (4 cas).

## Critères d'acceptation

- [x] AC1 — Proposition « Forage ! » avant le catalogue → slug ≠ `forage` ; `synchroniser()` →
  « Forage » a `forage`, la proposition reste en attente.
- [x] AC2 — Proposition « Forage » (le nom même) → slug `forage`, approuvée par `synchroniser()`,
  une seule ligne `forage%`.
- [x] AC3 — Lignes déjà en base, « Forage ! » en attente avec `forage` et « Fibre optique. »
  refusée avec `fibre-optique` → `synchroniser()` donne les slugs exacts au catalogue, et un slug
  suffixé aux deux propositions.
- [x] AC4 — « Forage ! » approuvée avec `forage` → elle le garde ; le catalogue prend `forage-2`.

## Hors périmètre

- Le test du front (`libelle-equipement.test.ts`) calcule toujours le slug depuis le nom : il ne
  voit pas le slug écrit en base. Inchangé.
- Un équipement du catalogue déjà créé sous `<slug>-2` n'est pas renommé : `synchroniser()` ne
  touche qu'aux noms absents.
- La création directe d'une étiquette par le super-admin (`POST /api/tags`) n'est pas une
  proposition et garde son slug.

## Notes d'implémentation

- Ablation, une règle à la fois : `horsCatalogue` retiré de `TagProposals` → AC1 rougit ; reprise
  du slug retirée de `assurer()` → AC3 rougit ; remis → 4 verts, `tests/Feature/Tags` 72 verts.
- Le détenteur est relu sous `lockForUpdate()` dans la transaction de `synchroniser()`.
