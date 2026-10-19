---
id: TCK-975
title: "Le balayage des index de test orphelins juge l'âge sur la dernière écriture et lit toutes les pages"
status: done
phase: P3
family: technique
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: [TCK-974]
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-53--index-meilisearch-testing_-et-smoke_-laissés-sur-linstance-docker-locale"
tags: [back, tests, search, meilisearch, harnais, pistes]
---

## Objectif utilisateur

Une exécution de tests très chargée ne se fait plus arracher ses index par une exécution
concurrente, et aucun index orphelin n'échappe au balayage faute d'être lu.

## Contexte

Réf : **P53.04** du fichier de pistes, `retenu · autonome` (A1 + A5). Contrat écrit du balayage
(`Tests\Support\TestSearchIndex`) : seuls les index d'exécutions mortes, et tous ceux-là.

Relu avant correctif (2026-10-19, `pre-dev` 22da7f13d) : l'âge d'orphelin (7 200 s) se comparait
à `createdAt`, alors qu'une exécution sous charge peut durer jusqu'à ~6 700 s (×11, `CLAUDE.md`) ;
`getIndexes()` était lu par une seule page de 1 000. Le troisième point de la piste (balayage au
seul premier test de recherche) est soldé par TCK-974.

## Hypothèses (mode sans humain)

- `updatedAt` suit les écritures d'un index (mesuré sur 7701 : `smoke_*` créés à 07:44 Z, mis à
  jour à 07:48 Z). La plus récente des deux dates connues fait foi ; sans date, on s'abstient.
- Une exécution qui ne fait que **lire** un index plus de deux heures après sa dernière écriture
  reste exposée : Meilisearch ne date pas les lectures.

## Delta à produire

- [x] `TestSearchIndex::isOrphan()` (prédicat pur) : âge sur la dernière écriture.
- [x] `TestSearchIndex::readAllPages()` : lecture de `GET /indexes` page par page (`offset`),
  bornée à 100 pages ; la suppression suit la lecture complète.
- [x] Test : `tests/Unit/Testing/TestSearchIndexSweepTest.php` (unitaire pur, 6 cas).

## Critères d'acceptation

- [x] AC1 — un index créé il y a longtemps mais écrit après le seuil n'est pas orphelin ; vieux et
  inerte, il l'est ; sans date, il ne l'est pas ; les siens et les noms étrangers ne le sont jamais.
- [x] AC2 — 2 500 index sur des pages de 1 000 sont tous lus, en trois appels.
- [x] AC3 — un serveur qui ignore `offset` n'entraîne pas de boucle sans fin.

## Hors périmètre

- Le seuil lui-même (7 200 s) ne bouge pas.

## Notes d'implémentation

- Ablation : `$lastWrite = $createdAt` → 1 rouge (AC1) ; arrêt après la première page → 2 rouges
  (AC2, AC3) ; remis → 6 verts.
- Le chemin réel a été éprouvé en lecture : `readAllPages` sur le client, pages de 3 → les 12 index
  de l'instance, en `Meilisearch\Endpoints\Indexes` dont `getUpdatedAt()` est rendu.
