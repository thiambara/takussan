---
id: TCK-2208
title: "`LegacyFeaturedConversion` réindexe les biens qu'elle touche"
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
  adr:
    - "docs/adr/0061-credits-d-espace-et-boost-des-annonces.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-122--écritures-qui-changent-un-document-indexé-sans-passer-par-lobservateur-scout"
tags: [api, recherche, boost, pistes]
---

## Objectif

`LegacyFeaturedConversion::run()` réindexe, à la fin, les biens dont elle a réécrit `featured` ou
`sponsored_until`.

## Contexte

Réf : **P122.04** du fichier de pistes, `validé`.

La conversion écrit par `DB::table('properties')->update()`, que l'observateur de Scout ne voit
pas. Un bien sans agence passait à `featured = false` en base et gardait `featured = true` dans
l'index : `PropertySearchService::featuredPool()` le servait en emplacement sponsorisé sans boost.
La règle est écrite dans `takussan-api/CLAUDE.md` § Recherche (TCK-1990).

## Décision du porteur

validé — validation du porteur (2026-10-24) : réindexer les biens touchés dans `LegacyFeaturedConversion` (règle de `takussan-api/CLAUDE.md` § Recherche, TCK-1990) ; reste : relever l'index de préproduction, où la migration 500400 a déjà tourné, et réimporter `Property` si un bien sans agence y garde `featured = true`

## Reste à faire

relever l'index de préproduction, où la migration 500400 a déjà tourné, et réimporter `Property` si un bien sans agence y garde `featured = true`

## Hypothèses (mode sans humain)

- « Les biens touchés » : tous ceux que la conversion réécrit, sans agence (`featured` tombe) comme
  d'agence (`sponsored_until` posé).
- La réindexation suit la synchronisation des modèles, comme `Property::reindexer()` et
  `GeoReindexation` : coupée (suite hors recherche, seed sous moteur coupé), elle ne fait rien. Un
  bien qui n'est plus indexable est retiré de l'index (`unsearchable`).

## Delta à produire

- [x] `LegacyFeaturedConversion` : ids des biens touchés, réindexés par lots de 200 à la fin.
- [x] `LegacyFeaturedConversionIndexTest`, sur Meilisearch (`InteractsWithMeilisearch`).

## Critères d'acceptation

- [x] AC1 — bien publié sans agence, `featured = true`, indexé et servi en `sponsored` (témoin) ;
      après la conversion : `featured` faux en base, et absent de `sponsored`.
- [x] AC2 — `BoostCatalogueTest` reste vert (conversion et idempotence).

## Notes d'implémentation

- Avant correctif : AC1 rouge sur la dernière assertion (l'index le sert encore).
- Ablation : l'appel à la réindexation retiré → AC1 rouge ; rétabli → vert.
- Piège : la migration `2026_10_12_500400` appelle ce service. Sur une base vide (`migrate:fresh`),
  aucun bien n'est touché et rien n'est lu. Sur une base qui n'a pas encore passé 500400 et porte
  des vedettes, la réindexation charge `address`, `tagsVisibles` et `agency` du schéma de ce
  moment-là (non mesuré ; la préproduction l'a déjà passée).
