---
id: TCK-1452
title: "Les écritures explicites dans l'index des biens attendent le commit de leur transaction"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1099, TCK-1101]
blocks: []
spec_refs:
  features:
    - "docs/features.md#24-recherche--filtres"
  models:
    - "docs/models-spec.md#3-property"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-90--écritures-explicites-dans-lindex-face-aux-transactions-et-à-scout_queue"
tags: [back, recherche, boost, pistes]
---

## Contexte

Réf : **P90.02** du fichier de pistes.

Sous `SCOUT_QUEUE=false`, un `searchable()` explicite écrit dans Meilisearch sur-le-champ,
transaction ouverte ou non. `SCOUT_AFTER_COMMIT` n'est lu que par l'observateur de Scout
(`vendor/laravel/scout/src/ModelObserver.php:46`). `.env.docker` pose `SCOUT_QUEUE=false` et
`SCOUT_AFTER_COMMIT=true` : l'observateur attend le commit, les écritures explicites non. Une
transaction annulée après `BoostLifecycle::writeProperty()` laissait la base à `featured=false` et
l'index à `featured=true`.

Les écritures explicites de `app/` qui peuvent tourner dans une transaction :
`BoostLifecycle::writeProperty()` (achat, offre, annulation, réconciliation d'un boost, et
`PropertyObserver::updated` → `reconcile()`), `Property::reindexer()` (équipements d'un bien,
`PropertyController`) et `GeoReindexation::biens()` (dont `TagCatalog::synchroniser`, dans sa
transaction). `SyncAgencyPropertiesSearchIndex` et `RefreshNewBuildSearchLabel` sont des jobs, qui
ne tournent pas dans une transaction de l'appelant.

## Décision du porteur

« validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket »

Critère accordé : V6 (classement du mesureur : faire passer les appelants explicites par
`DB::afterCommit()` ou une méthode partagée, choix de structure dont le gain dépend d'une variable
de préproduction inconnue, V5).

**Choix retenu** : la voie que la piste recommande, une méthode partagée. `Property::reindexer()`
(TCK-1099) enveloppe son écriture dans `DB::afterCommit()`, et `writeProperty()` passe par elle ;
`GeoReindexation::biens()`, qui réindexe une liste d'ids par lots, enveloppe de même son
`chunkById()`. `DB::afterCommit()` exécute sur-le-champ hors transaction : les appels faits hors
transaction ne changent pas.

## Reste à faire

Relever `SCOUT_QUEUE` et `SCOUT_AFTER_COMMIT` de la préproduction dans `hebergement.md` : chemin
fermé à l'implémenteur (`docs/infra/`), et la préproduction est hors du poste.

## Objectif

Une écriture explicite dans l'index des biens suit la même règle que l'observateur sous
`SCOUT_AFTER_COMMIT=true` : elle n'a lieu qu'une fois la transaction validée.

## Delta à produire

- [x] `Property::reindexer()` : écriture dans `DB::afterCommit()`.
- [x] `BoostLifecycle::writeProperty()` : passe par `$fresh->reindexer()`.
- [x] `GeoReindexation::biens()` : réindexation dans `DB::afterCommit()`.
- [x] Test `tests/Feature/Search/IndexApresCommitTest.php`.

## Critères d'acceptation

- [x] AC1 — `writeProperty($bien, ['featured' => true])` dans une transaction annulée : base et index à `featured=false` ; validée : index à `true`.
- [x] AC2 — `Property::reindexer()` dans une transaction annulée n'indexe pas le bien ; hors transaction, il l'indexe sur-le-champ.
- [x] AC3 — `GeoReindexation::biens()` dans une transaction annulée n'indexe rien ; validée, il indexe.

## Hors périmètre

- Le sort d'une écriture d'index qui échoue après le commit : P90.04 (TCK-1454) pour l'achat
  d'un boost, reste de P90.03 au porteur pour la modération.

## Notes d'implémentation

- Piège : la fixture se crée sous `Property::withoutSyncingToSearch()`. La suite pose
  `SCOUT_AFTER_COMMIT=false`, et l'observateur indexe le bien dès sa création : le témoin
  « absent de l'index » n'était vert qu'au hasard du moteur.
- Avant correctif : 3 rouges (les trois transactions annulées laissent le document écrit),
  3 témoins verts.
- Ablation : `app/` rendu à `HEAD` → les 3 mêmes rouges ; correctif remis → 6 verts.
