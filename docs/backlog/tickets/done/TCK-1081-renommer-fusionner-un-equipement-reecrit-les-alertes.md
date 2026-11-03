---
id: TCK-1081
title: "Renommer ou fusionner un équipement réécrit les recherches sauvegardées qui le demandent par son nom"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models:
    - "docs/models-spec.md#23-savedsearch-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#un-équipement-proposé-puis-renommé-ou-fusionné-vide-les-alertes-qui-le-demandent-par-son-nom"
tags: [back, recherche, alertes, referentiel, pistes]
---

## Objectif utilisateur

Une alerte qui demande un équipement proposé continue de trouver les biens qui le portent après
que la console l'a renommé ou fusionné dans un autre.

## Contexte

Réf : **P67.03** du fichier de pistes, `validé` (critère V7 accordé, et la réécriture de
`saved_searches.criteria`, V4, choisie par le porteur).

Le filtre `tags` est une égalité sur le nom indexé, une clause par équipement
(`PropertySearchService::buildFilter()`). `TagModeration::renommer()` et `fusionner()` ne
touchaient pas `saved_searches`. Mesuré avant correctif (test de garde ci-dessous) : après
`PATCH /api/admin/tags/{Jacuzzi}` → « Jacuzzi extérieur » et `POST …/{Pool}/merge` vers
« Bassin », `criteria` gardait `["Jacuzzi"]` et `"Piscine,Pool"`.

## Décision du porteur

> (a) réécrire `criteria.tags` des recherches sauvegardées (nom source → nom cible) dans la transaction de `TagModeration::renommer()` et `fusionner()` ; test : renommer, fusionner, rejouer l'alerte (porteur, 2026-10-20)

## Hypothèses (mode sans humain)

- La comparaison du nom est exacte, après `trim` : c'est l'égalité qu'applique le filtre.
- La forme est gardée : une chaîne `a,b` (forme de l'URL) reste une chaîne, une liste reste une
  liste, l'ordre et les autres clés de `criteria` aussi. Un nom présent deux fois après une
  fusion n'est gardé qu'une fois.
- La page catalogue (`PATCH /api/tags/{id}`) renomme par le même `renommer()` : elle est couverte.
- Les alertes sans compte vivent dans la même table (`alert_subscriber_id`) : couvertes.

## Delta à produire

- [x] `TagModeration::reecrireRecherchesSauvegardees()`, appelée dans la transaction de
  `renommer()` et de `fusionner()`.
- [x] Test `Tests\Feature\Tags\TagModerationSavedSearchTest`.

## Critères d'acceptation

- [x] AC1 — après renommage, `criteria.tags` porte le nouveau nom ; après fusion, le nom de la cible.
- [x] AC2 — `alertMatches()` sur les critères réécrits rend le bien, alerte à deux équipements comprise.
- [x] AC3 — une recherche sans `tags`, ou sur un autre équipement, n'est pas modifiée.

## Hors périmètre

- Ce que devient une alerte sur une proposition **refusée** (ses liaisons sont retirées) : non
  tranché par le porteur.
- Le filtre par identifiant ou slug (l'autre voie de la piste), écarté par la décision.

## Notes d'implémentation

- Ablation : les deux appels retirés → 1 rouge (`criteria` garde `["Jacuzzi"]`) ; remis → vert,
  et 19 verts sur les trois autres classes de `tests/Feature/Tags` qui modèrent.
- Piège du test : `bedrooms = 0` dans les critères exclut un bien sans chambres renseignées, et
  `furnished` est aléatoire dans la factory : le bien du test le fixe.
